create table if not exists public.mail_send_locks (
  key text primary key,
  type text not null,
  target_email text not null,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.mail_send_locks enable row level security;
