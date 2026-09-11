create table if not exists public.suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.suppressed_emails to authenticated;
grant all on public.suppressed_emails to service_role;
alter table public.suppressed_emails enable row level security;
create policy "service full access suppressed_emails" on public.suppressed_emails for all to service_role using (true) with check (true);

create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  created_at timestamptz not null default now()
);
grant select, insert on public.email_send_log to authenticated;
grant all on public.email_send_log to service_role;
alter table public.email_send_log enable row level security;
create policy "service full access email_send_log" on public.email_send_log for all to service_role using (true) with check (true);

create table if not exists public.email_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.email_unsubscribe_tokens to service_role;
alter table public.email_unsubscribe_tokens enable row level security;
create policy "service full access email_unsubscribe_tokens" on public.email_unsubscribe_tokens for all to service_role using (true) with check (true);