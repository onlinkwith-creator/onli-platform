create or replace function public.create_settlements_for_completed_request()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or old.operation_status is distinct from new.operation_status
    or old.assignment_status is distinct from new.assignment_status
    or old.settlement_status is distinct from new.settlement_status
    or old.status is distinct from new.status then
    if coalesce(new.operation_status,'') in ('completed','operation_completed')
      or coalesce(new.assignment_status,'') in ('assigned','preparing','ready')
      or coalesce(new.settlement_status,'') in ('pending','confirmed','completed','on_hold')
      or coalesce(new.status,'') in ('completed','settlement_pending','settled','업무완료','운영완료','정산대기','정산완료') then
      perform public.ensure_settlements_for_request(new.id);
    end if;
  end if;
  return new;
end;
$$;

notify pgrst,'reload schema';
