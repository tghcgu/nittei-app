import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

export async function createTestDatabase() {
  const db = await PGlite.create()
  await db.exec(`
    create role anon;
    create role authenticated;
    create table events (
      id uuid primary key default gen_random_uuid(), share_id text unique not null,
      name text not null, description text, answer_choices text not null default '○△✕',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table candidates (
      id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
      date date not null, time_label text, sort_order integer not null default 0
    );
    create table responses (
      id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
      name text not null, note text, created_at timestamptz not null default now()
    );
    create table answers (
      id uuid primary key default gen_random_uuid(), response_id uuid not null references responses(id) on delete cascade,
      candidate_id uuid not null references candidates(id) on delete cascade,
      value text not null check (value in ('◎','○','△','✕','-')), note text,
      unique(response_id, candidate_id)
    );
    grant usage on schema public to anon, authenticated;
  `)
  await db.exec(await readFile('supabase/auto-delete-old-events.sql', 'utf8'))
  await db.exec(await readFile('supabase/secure-scheduling.sql', 'utf8'))
  return db
}
