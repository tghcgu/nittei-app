-- 回答の選択肢（伝助と同じ3種類）を使えるようにする
-- Supabase の SQL Editor で実行してください

-- 1) イベントごとに選択肢セットを持たせる（既存イベントは「○△✕」になる）
alter table public.events
  add column if not exists answer_choices text not null default '○△✕';

alter table public.events
  drop constraint if exists events_answer_choices_check;

alter table public.events
  add constraint events_answer_choices_check
  check (answer_choices in ('○△✕', '○✕', '◎○△✕'));

-- 2) 回答値として ◎ を許可する（今の制約は ○ △ ✕ - のみ）
alter table public.answers
  drop constraint if exists answers_value_check;

alter table public.answers
  add constraint answers_value_check
  check (value in ('◎', '○', '△', '✕', '-'));
