-- Apply together with the secure-scheduling client release. Existing URLs survive.
-- Existing rows have no owner identity; their link-based editing remains enabled.
-- New events/responses require their edit token. No existing rows are deleted.
begin;

alter table public.events add column if not exists edit_token_hash text;
alter table public.events add column if not exists edit_protected boolean
  generated always as (edit_token_hash is not null) stored;
alter table public.responses add column if not exists edit_token_hash text;
alter table public.responses add column if not exists edit_protected boolean
  generated always as (edit_token_hash is not null) stored;

create or replace function public.nittei_token_hash(token text)
returns text language sql immutable strict set search_path = '' as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex');
$$;

create or replace function public.nittei_scoped_event_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.events
  where share_id = (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-nittei-share-id');
$$;

create or replace function public.nittei_can_edit_event(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events where id = target_id
      and id = public.nittei_scoped_event_id()
      and (edit_token_hash is null or edit_token_hash = public.nittei_token_hash(
        nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-nittei-edit-token'
      ))
  );
$$;

create or replace function public.nittei_save_event(
  p_id uuid, p_share_id text, p_edit_token text, p_name text,
  p_description text, p_answer_choices text, p_candidates jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing public.events%rowtype;
  item jsonb;
  candidate_id uuid;
  kept_ids uuid[] := '{}';
begin
  if p_id is null or p_share_id is null or length(p_share_id) = 0
    or p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200
    or length(coalesce(p_description, '')) > 10000
    or p_answer_choices is null or p_answer_choices not in ('○✕', '○△✕', '◎○△✕')
    or p_candidates is null or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) not between 1 and 1000 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- Serializes retries for this UUID, including a first submission not yet committed.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.events where id = p_id for update;
  if found then
    if existing.share_id <> p_share_id or not public.nittei_can_edit_event(p_id) then
      raise exception 'EDIT_FORBIDDEN' using errcode = '42501';
    end if;
  else
    if p_share_id !~ '^[a-z0-9]{8}$' then
      raise exception 'INVALID_SHARE_ID' using errcode = '22023';
    end if;
    if p_edit_token is null or p_edit_token !~ '^[a-f0-9]{64}$' then
      raise exception 'INVALID_EDIT_TOKEN' using errcode = '22023';
    end if;
    insert into public.events(id, share_id, name, description, answer_choices, edit_token_hash)
    values (p_id, p_share_id, p_name, nullif(p_description, ''), p_answer_choices, public.nittei_token_hash(p_edit_token));
  end if;

  for item in select value from jsonb_array_elements(p_candidates) loop
    candidate_id := coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid());
    if candidate_id = any(kept_ids) or (item->>'date') is null
      or (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or length(coalesce(item->>'time_label', '')) > 100 then
      raise exception 'INVALID_CANDIDATE' using errcode = '22023';
    end if;
    if exists(select 1 from public.candidates where id = candidate_id and event_id <> p_id) then
      raise exception 'CANDIDATE_FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.candidates(id, event_id, date, time_label, sort_order)
    values (candidate_id, p_id, (item->>'date')::date, nullif(item->>'time_label', ''), cardinality(kept_ids))
    on conflict(id) do update set date = excluded.date, time_label = excluded.time_label, sort_order = excluded.sort_order
      where public.candidates.event_id = p_id;
    if not found then raise exception 'CANDIDATE_FORBIDDEN' using errcode = '42501'; end if;
    kept_ids := array_append(kept_ids, candidate_id);
  end loop;

  if exists (
    select 1 from public.answers a join public.candidates c on c.id = a.candidate_id
    where c.event_id = p_id and c.id = any(kept_ids)
      and a.value <> '-' and strpos(p_answer_choices, a.value) = 0
  ) then
    raise exception 'ANSWER_CHOICES_IN_USE' using errcode = '22023';
  end if;

  delete from public.candidates where event_id = p_id and not (id = any(kept_ids));
  update public.events set name = p_name, description = nullif(p_description, ''), answer_choices = p_answer_choices where id = p_id;
  return p_id;
end;
$$;

create or replace function public.nittei_save_response(
  p_id uuid, p_edit_token text, p_name text, p_note text, p_answers jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  scoped_id uuid := public.nittei_scoped_event_id();
  parent public.events%rowtype;
  existing public.responses%rowtype;
  item jsonb;
  candidate_id uuid;
  seen_ids uuid[] := '{}';
begin
  if scoped_id is null then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  select * into parent from public.events where id = scoped_id for update;
  if p_id is null or p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200
    or length(coalesce(p_note, '')) > 10000 or p_answers is null
    or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 1000 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  select * into existing from public.responses where id = p_id for update;
  if found then
    if existing.event_id <> scoped_id or not (
      existing.edit_token_hash is null
      or coalesce(existing.edit_token_hash = public.nittei_token_hash(p_edit_token), false)
      or public.nittei_can_edit_event(scoped_id)
    ) then raise exception 'EDIT_FORBIDDEN' using errcode = '42501'; end if;
    update public.responses set name = p_name, note = nullif(p_note, '') where id = p_id;
  else
    if p_edit_token is null or p_edit_token !~ '^[a-f0-9]{64}$' then
      raise exception 'INVALID_EDIT_TOKEN' using errcode = '22023';
    end if;
    insert into public.responses(id, event_id, name, note, edit_token_hash)
    values(p_id, scoped_id, p_name, nullif(p_note, ''), public.nittei_token_hash(p_edit_token));
  end if;

  delete from public.answers where response_id = p_id;
  for item in select value from jsonb_array_elements(p_answers) loop
    candidate_id := (item->>'candidate_id')::uuid;
    if candidate_id is null or candidate_id = any(seen_ids)
      or not exists(select 1 from public.candidates where id = candidate_id and event_id = scoped_id)
      or item->>'value' is null or (item->>'value' not in ('◎','○','△','✕','-'))
      or (item->>'value' <> '-' and strpos(parent.answer_choices, item->>'value') = 0)
      or length(coalesce(item->>'note', '')) > 10000 then
      raise exception 'INVALID_ANSWER' using errcode = '22023';
    end if;
    insert into public.answers(response_id, candidate_id, value, note)
    values(p_id, candidate_id, item->>'value', case when item->>'value' = '-' then nullif(item->>'note', '') else null end);
    seen_ids := array_append(seen_ids, candidate_id);
  end loop;
  return p_id;
end;
$$;

create or replace function public.nittei_delete_response(p_id uuid, p_edit_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  scoped_id uuid := public.nittei_scoped_event_id();
  existing public.responses%rowtype;
begin
  if scoped_id is null then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  perform 1 from public.events where id = scoped_id for update;
  select * into existing from public.responses where id = p_id for update;
  if not found then return; end if;
  if existing.event_id <> scoped_id or not (
    existing.edit_token_hash is null
    or coalesce(existing.edit_token_hash = public.nittei_token_hash(p_edit_token), false)
    or public.nittei_can_edit_event(scoped_id)
  ) then raise exception 'EDIT_FORBIDDEN' using errcode = '42501'; end if;
  delete from public.answers where response_id = p_id;
  delete from public.responses where id = p_id;
end;
$$;

-- Remove permissive historical policies; writes now run only through checked RPCs.
do $$ declare policy record; begin
  for policy in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('events','candidates','responses','answers')
  loop execute format('drop policy %I on public.%I', policy.policyname, policy.tablename); end loop;
end $$;

alter table public.events enable row level security;
alter table public.candidates enable row level security;
alter table public.responses enable row level security;
alter table public.answers enable row level security;
revoke all on public.events, public.candidates, public.responses, public.answers from public, anon, authenticated;
grant select(id, share_id, name, description, answer_choices, created_at, updated_at, edit_protected) on public.events to anon, authenticated;
grant select on public.candidates, public.answers to anon, authenticated;
grant select(id, event_id, name, note, created_at, edit_protected) on public.responses to anon, authenticated;

create policy events_read_by_link on public.events for select to anon, authenticated
  using (id = public.nittei_scoped_event_id());
create policy candidates_read_by_link on public.candidates for select to anon, authenticated
  using (event_id = public.nittei_scoped_event_id());
create policy responses_read_by_link on public.responses for select to anon, authenticated
  using (event_id = public.nittei_scoped_event_id());
create policy answers_read_by_link on public.answers for select to anon, authenticated
  using (exists(select 1 from public.candidates where id = answers.candidate_id and event_id = public.nittei_scoped_event_id()));

revoke all on function public.nittei_token_hash(text) from public;
revoke all on function public.nittei_scoped_event_id() from public;
revoke all on function public.nittei_can_edit_event(uuid) from public;
revoke all on function public.nittei_save_event(uuid,text,text,text,text,text,jsonb) from public;
revoke all on function public.nittei_save_response(uuid,text,text,text,jsonb) from public;
revoke all on function public.nittei_delete_response(uuid,text) from public;
grant execute on function public.nittei_scoped_event_id() to anon, authenticated;
grant execute on function public.nittei_can_edit_event(uuid) to anon, authenticated;
grant execute on function public.nittei_save_event(uuid,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.nittei_save_response(uuid,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.nittei_delete_response(uuid,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
