-- Phase 1 RLS policies for the public scheduling app.
-- This keeps the current no-login flow working while blocking deletes.
-- Run this in Supabase SQL Editor after deploying the code change that
-- removes answers.delete() from response editing.

alter table public.events enable row level security;
alter table public.candidates enable row level security;
alter table public.responses enable row level security;
alter table public.answers enable row level security;

drop policy if exists "events_select_public" on public.events;
drop policy if exists "events_insert_public" on public.events;
drop policy if exists "candidates_select_public" on public.candidates;
drop policy if exists "candidates_insert_public" on public.candidates;
drop policy if exists "responses_select_public" on public.responses;
drop policy if exists "responses_insert_public" on public.responses;
drop policy if exists "responses_update_public" on public.responses;
drop policy if exists "answers_select_public" on public.answers;
drop policy if exists "answers_insert_public" on public.answers;
drop policy if exists "answers_update_public" on public.answers;

create policy "events_select_public"
on public.events
for select
to anon, authenticated
using (true);

create policy "events_insert_public"
on public.events
for insert
to anon, authenticated
with check (true);

create policy "candidates_select_public"
on public.candidates
for select
to anon, authenticated
using (true);

create policy "candidates_insert_public"
on public.candidates
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = candidates.event_id
  )
);

create policy "responses_select_public"
on public.responses
for select
to anon, authenticated
using (true);

create policy "responses_insert_public"
on public.responses
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = responses.event_id
  )
);

create policy "responses_update_public"
on public.responses
for update
to anon, authenticated
using (true)
with check (
  exists (
    select 1
    from public.events
    where events.id = responses.event_id
  )
);

create policy "answers_select_public"
on public.answers
for select
to anon, authenticated
using (true);

create policy "answers_insert_public"
on public.answers
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.responses
    join public.candidates on candidates.id = answers.candidate_id
    where responses.id = answers.response_id
      and candidates.event_id = responses.event_id
  )
);

create policy "answers_update_public"
on public.answers
for update
to anon, authenticated
using (true)
with check (
  exists (
    select 1
    from public.responses
    join public.candidates on candidates.id = answers.candidate_id
    where responses.id = answers.response_id
      and candidates.event_id = responses.event_id
  )
);

-- Verify RLS is enabled:
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('events', 'candidates', 'responses', 'answers');
