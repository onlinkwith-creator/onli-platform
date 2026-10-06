begin;
-- Legacy notification rules classify admin records as internal. Override only
-- IDs created by the new private automatic-alert queue, never historical mail.
create function public.normalize_admin_action_alert_channel() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery_status text;
begin
 select status into delivery_status from public.admin_action_alerts where id=new.id;
 if delivery_status is not null then
  if delivery_status='muted' then new.channel:='internal';new.recipient_email:=null;
  else new.channel:='email';new.recipient_email:='onlinkwith@gmail.com'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.normalize_admin_action_alert_channel() from public,anon,authenticated;
create trigger zzzz_normalize_admin_action_alert_channel before insert or update on public.notifications
for each row execute function public.normalize_admin_action_alert_channel();
update public.notifications n set channel='email',recipient_email='onlinkwith@gmail.com'
from public.admin_action_alerts a where n.id=a.id and a.status<>'muted';
commit;
notify pgrst,'reload schema';
