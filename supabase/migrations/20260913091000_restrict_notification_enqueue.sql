begin;

-- These internal helpers accept arbitrary recipients. Only trusted server code
-- and security-definer database triggers may call them, never browser clients.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'enqueue_backoffice_notification','enqueue_notification_event_v2'
    )
  loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end;
$$;

commit;
notify pgrst,'reload schema';
