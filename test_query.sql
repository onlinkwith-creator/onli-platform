select
  t.tgname as trigger_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  n2.nspname as function_schema,
  p.proname as trigger_function,
  pg_get_function_identity_arguments(p.oid) as function_arguments,
  p.oid as function_oid
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace
join pg_proc p
  on p.oid = t.tgfoid
join pg_namespace n2
  on n2.oid = p.pronamespace
where n.nspname = 'public'
  and c.relname = 'job_applications'
  and not t.tgisinternal
order by t.tgname;
