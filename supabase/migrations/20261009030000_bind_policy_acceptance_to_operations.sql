begin;

alter table public.interpreters add column policy_receipt_id uuid references public.policy_acceptance_history(id);
alter table public.requests add column policy_receipt_id uuid references public.policy_acceptance_history(id);
alter table public.job_applications add column policy_receipt_id uuid references public.policy_acceptance_history(id);

create table public.policy_operation_bindings (
 receipt_id uuid primary key references public.policy_acceptance_history(id),
 target_table text not null check(target_table in ('interpreters','requests','job_applications','assignment_offers')),
 target_id text not null,
 bound_at timestamptz not null default clock_timestamp()
);
alter table public.policy_operation_bindings enable row level security;
revoke all on public.policy_operation_bindings from public,anon,authenticated;
create trigger policy_binding_immutable before update on public.policy_operation_bindings
for each row execute function public.guard_policy_acceptance_update();

create function public.bind_policy_operation(p_receipt_id uuid,p_action text,p_subject_id uuid,p_table text,p_target_id text)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.policy_acceptance_history%rowtype; binding public.policy_operation_bindings%rowtype;
begin
 if auth.uid() is null or p_receipt_id is null then raise exception 'POLICY_RECEIPT_REQUIRED' using errcode='42501'; end if;
 select * into receipt from public.policy_acceptance_history where id=p_receipt_id for update;
 if not found or receipt.actor_id is distinct from auth.uid() or receipt.action is distinct from p_action
 or receipt.subject_id is distinct from p_subject_id
 then raise exception 'POLICY_RECEIPT_MISMATCH' using errcode='42501'; end if;
 select * into binding from public.policy_operation_bindings where receipt_id=p_receipt_id;
 if found then
  if binding.target_table is distinct from p_table or binding.target_id is distinct from p_target_id
  then raise exception 'POLICY_RECEIPT_ALREADY_USED'; end if;
  return receipt.recorded_at;
 end if;
 perform 1 from public.policy_revisions where version=receipt.version
  and published_at<=now() and effective_at<=now() and (retired_at is null or retired_at>now()) for share;
 if not found then raise exception 'POLICY_VERSION_NOT_ACTIVE'; end if;
 insert into public.policy_operation_bindings(receipt_id,target_table,target_id) values(p_receipt_id,p_table,p_target_id);
 return receipt.recorded_at;
end; $$;
revoke all on function public.bind_policy_operation(uuid,text,uuid,text,text) from public,anon,authenticated;

create function public.guard_operation_policy_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare action_name text; subject uuid; recorded timestamptz; trusted boolean;
begin
 trusted:=public.is_active_admin() or auth.role()='service_role';
 if tg_op='UPDATE' then
  if new.policy_receipt_id is not distinct from old.policy_receipt_id then
   if trusted then return new; end if;
   if new.agreed_at is not distinct from old.agreed_at
    and new.agreed_terms is not distinct from old.agreed_terms
    and new.agreed_policy is not distinct from old.agreed_policy then
    if tg_table_name='job_applications' then
     if new.job_id is distinct from old.job_id or new.interpreter_id is distinct from old.interpreter_id
      or new.agreed_cancel_policy is distinct from old.agreed_cancel_policy
      or new.cancel_policy_agreed_at is distinct from old.cancel_policy_agreed_at
     then raise exception 'POLICY_FRESH_RECEIPT_REQUIRED'; end if;
    elsif tg_table_name='interpreters' then
     if new.auth_user_id is distinct from old.auth_user_id then raise exception 'POLICY_FRESH_RECEIPT_REQUIRED'; end if;
    elsif tg_table_name='requests' then
     if new.company_auth_user_id is distinct from old.company_auth_user_id then raise exception 'POLICY_FRESH_RECEIPT_REQUIRED'; end if;
    end if;
    return new;
   end if;
   raise exception 'POLICY_FRESH_RECEIPT_REQUIRED';
  end if;
 elsif trusted and new.policy_receipt_id is null then
  return new;
 end if;
 if tg_table_name='requests' then
  action_name:='company_request';
  if new.company_auth_user_id is distinct from auth.uid() then raise exception 'POLICY_RECEIPT_MISMATCH' using errcode='42501'; end if;
  new.policy_receipt_id:=coalesce(new.policy_receipt_id,nullif(current_setting('app.onli_policy_receipt',true),'')::uuid);
 elsif tg_table_name='interpreters' then
  action_name:='interpreter_registration';
  if new.auth_user_id is distinct from auth.uid() then raise exception 'POLICY_RECEIPT_MISMATCH' using errcode='42501'; end if;
 elsif tg_table_name='job_applications' then
  action_name:='job_application'; subject:=new.job_id;
  if not public.portal_owns_interpreter(new.interpreter_id) then raise exception 'POLICY_RECEIPT_MISMATCH' using errcode='42501'; end if;
 else raise exception 'POLICY_INVALID_CONTEXT'; end if;
 if new.agreed_terms is distinct from true or new.agreed_policy is distinct from true
 then raise exception 'POLICY_ACKNOWLEDGEMENT_REQUIRED'; end if;
 if exists(select 1 from public.policy_operation_bindings where receipt_id=new.policy_receipt_id)
 then raise exception 'POLICY_RECEIPT_ALREADY_USED'; end if;
 recorded:=public.bind_policy_operation(new.policy_receipt_id,action_name,subject,tg_table_name,new.id::text);
 new.agreed_at:=recorded;
 if tg_table_name='job_applications' then
  if new.agreed_cancel_policy is distinct from true then raise exception 'POLICY_CANCEL_ACKNOWLEDGEMENT_REQUIRED'; end if;
  new.cancel_policy_agreed_at:=recorded;
 end if;
 return new;
end; $$;
revoke all on function public.guard_operation_policy_receipt() from public,anon,authenticated;
create trigger zz_operation_policy_receipt before insert or update on public.interpreters
for each row execute function public.guard_operation_policy_receipt();
create trigger zz_operation_policy_receipt before insert or update on public.requests
for each row execute function public.guard_operation_policy_receipt();
create trigger zz_operation_policy_receipt before insert or update on public.job_applications
for each row execute function public.guard_operation_policy_receipt();

-- Keep canonical validation and its return shape; only provide transaction-local receipt context.
alter function public.submit_company_request(jsonb) rename to submit_company_request_without_policy;
revoke all on function public.submit_company_request_without_policy(jsonb) from public,anon,authenticated;
create function public.submit_company_request(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous_context text; result jsonb;
begin
 if auth.uid() is null or nullif(p_payload->>'policy_receipt_id','') is null
 then raise exception 'POLICY_RECEIPT_REQUIRED' using errcode='42501'; end if;
 previous_context:=current_setting('app.onli_policy_receipt',true);
 perform set_config('app.onli_policy_receipt',(p_payload->>'policy_receipt_id')::uuid::text,true);
 result:=public.submit_company_request_without_policy(p_payload-'policy_receipt_id');
 perform set_config('app.onli_policy_receipt',coalesce(previous_context,''),true);
 return result;
end; $$;
revoke all on function public.submit_company_request(jsonb) from public,anon;
grant execute on function public.submit_company_request(jsonb) to authenticated;

alter function public.respond_assignment_offer(uuid,boolean) rename to respond_assignment_offer_without_policy;
revoke all on function public.respond_assignment_offer_without_policy(uuid,boolean) from public,anon,authenticated;
create function public.respond_assignment_offer(p_offer_id uuid,p_accept boolean,p_policy_receipt_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.respond_assignment_offer_without_policy(p_offer_id,p_accept);
 if p_accept is true and result->>'status'='accepted' then
  perform public.bind_policy_operation(p_policy_receipt_id,'assignment_acceptance',p_offer_id,'assignment_offers',p_offer_id::text);
 end if;
 return result;
end; $$;
revoke all on function public.respond_assignment_offer(uuid,boolean,uuid) from public,anon;
grant execute on function public.respond_assignment_offer(uuid,boolean,uuid) to authenticated;

create function public.get_my_policy_operations() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('receipt_id',b.receipt_id,'target_table',b.target_table,
  'target_id',b.target_id,'bound_at',b.bound_at) order by b.bound_at desc),'[]'::jsonb)
 from public.policy_operation_bindings b join public.policy_acceptance_history h on h.id=b.receipt_id
 where h.actor_id=auth.uid();
$$;
revoke all on function public.get_my_policy_operations() from public,anon;
grant execute on function public.get_my_policy_operations() to authenticated;
commit;
