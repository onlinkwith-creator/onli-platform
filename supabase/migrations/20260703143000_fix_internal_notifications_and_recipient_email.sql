-- Keep internal notifications as admin-visible records, not failed email jobs.
update public.notifications
set
  status = 'sent',
  sent_at = coalesce(sent_at, created_at, now()),
  error_message = null
where channel = 'internal'
  and (
    status is distinct from 'sent'
    or error_message is not null
  );

-- Normalize placeholder recipient emails before resolving real addresses.
update public.notifications
set recipient_email = null
where nullif(trim(coalesce(recipient_email, '')), '') in ('-', '정보 없음');

-- Company notifications use businesses in this schema.
update public.notifications n
set recipient_email = b.contact_email
from public.businesses b
where n.recipient_type in ('company', 'client')
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and b.auth_user_id = n.recipient_id
  and nullif(trim(coalesce(b.contact_email, '')), '') is not null;

update public.notifications n
set recipient_email = b.contact_email
from public.requests r
join public.businesses b on b.auth_user_id = r.company_auth_user_id
where n.recipient_type in ('company', 'client')
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and n.related_request_id::text = r.id::text
  and nullif(trim(coalesce(b.contact_email, '')), '') is not null;

-- Interpreter notifications are keyed by auth_user_id when available.
update public.notifications n
set recipient_email = i.email
from public.interpreters i
where n.recipient_type = 'interpreter'
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and i.auth_user_id = n.recipient_id
  and nullif(trim(coalesce(i.email, '')), '') is not null;

-- Admin notifications use admin_users email in this schema.
update public.notifications n
set recipient_email = au.email
from public.admin_users au
where n.recipient_type = 'admin'
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and (
    au.auth_user_id = n.recipient_id
    or lower(trim(au.email)) = lower(trim(coalesce(n.recipient_email, '')))
  )
  and nullif(trim(coalesce(au.email, '')), '') is not null;

notify pgrst, 'reload schema';
