-- Auto-delete events that have had no activity for 365 days.
--
-- Run this once in the Supabase SQL Editor before enabling the Vercel Cron job.
-- Existing events start their 365-day clock from the time this SQL is applied,
-- which avoids deleting older events immediately.

alter table public.events
add column if not exists updated_at timestamptz;

update public.events
set updated_at = now()
where updated_at is null;

alter table public.events
alter column updated_at set default now();

alter table public.events
alter column updated_at set not null;

create index if not exists events_updated_at_idx
on public.events (updated_at);

create or replace function public.set_event_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_event_updated_at();

create or replace function public.touch_event_from_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.events
    set updated_at = now()
    where id = old.event_id;
  elsif tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    update public.events
    set updated_at = now()
    where id in (old.event_id, new.event_id);
  else
    update public.events
    set updated_at = now()
    where id = new.event_id;
  end if;

  return null;
end;
$$;

drop trigger if exists candidates_touch_event on public.candidates;
create trigger candidates_touch_event
after insert or update or delete on public.candidates
for each row
execute function public.touch_event_from_candidate();

create or replace function public.touch_event_from_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.events
    set updated_at = now()
    where id = old.event_id;
  elsif tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    update public.events
    set updated_at = now()
    where id in (old.event_id, new.event_id);
  else
    update public.events
    set updated_at = now()
    where id = new.event_id;
  end if;

  return null;
end;
$$;

drop trigger if exists responses_touch_event on public.responses;
create trigger responses_touch_event
after insert or update or delete on public.responses
for each row
execute function public.touch_event_from_response();

create or replace function public.touch_event_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_response_id uuid;
begin
  target_response_id := case
    when tg_op = 'DELETE' then old.response_id
    else new.response_id
  end;

  update public.events
  set updated_at = now()
  where id in (
    select responses.event_id
    from public.responses
    where responses.id = target_response_id
  );

  return null;
end;
$$;

drop trigger if exists answers_touch_event on public.answers;
create trigger answers_touch_event
after insert or update or delete on public.answers
for each row
execute function public.touch_event_from_answer();

-- Verify:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'events'
--   and column_name = 'updated_at';
