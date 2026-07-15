-- お問い合わせフォームの送信内容を保存するテーブル
-- (メールアドレスをサイト上に公開しない代わりに、フォームから直接受け取る)
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 2000),
  email text check (email is null or char_length(email) <= 255)
);

alter table public.inquiries enable row level security;

-- 誰でも送信(INSERT)はできるが、閲覧・変更・削除はできない
-- (中身は Supabase ダッシュボードの Table Editor でのみ確認する)
create policy "anyone can insert inquiries"
  on public.inquiries
  for insert
  to anon
  with check (true);
