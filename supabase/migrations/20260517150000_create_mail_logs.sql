create table if not exists public.mail_logs (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  mail_type text not null,
  recipient text not null,
  related_id text,
  created_at timestamptz default now()
);

