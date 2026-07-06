-- Keep request_interpreters as the canonical assignment table.
-- A row existing for request_id + interpreter_id means the interpreter is assigned.

with ranked_assignments as (
  select
    id,
    row_number() over (
      partition by request_id, interpreter_id
      order by assigned_at desc nulls last, id desc
    ) as row_rank
  from public.request_interpreters
)
delete from public.request_interpreters ri
using ranked_assignments ranked
where ri.id = ranked.id
  and ranked.row_rank > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.request_interpreters'::regclass
      and conname = 'request_interpreters_request_id_interpreter_id_unique'
  ) then
    alter table public.request_interpreters
    add constraint request_interpreters_request_id_interpreter_id_unique
    unique (request_id, interpreter_id);
  end if;
end $$;

notify pgrst, 'reload schema';
