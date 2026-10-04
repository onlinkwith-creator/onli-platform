begin;

-- Business events own their recipients. The browser must not supply an email address.
create or replace function public.queue_interpreter_workflow_notifications()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if nullif(trim(new.email), '') is null then return new; end if;

  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.enqueue_notification_event_v2(
      'interpreter_approved', 'interpreter', new.id::text, 'interpreter',
      new.email, null, jsonb_build_object('interpreter_id',new.id,'name',new.name,'email',new.email,
        'availableRegions',new.available_regions,'specialties',new.specialties),
      'email','통역사 등록 승인','통역사 등록이 승인되었습니다.',
      null::uuid,null::uuid,new.auth_user_id,new.name
    );
  end if;

  if new.approved is true and old.approved is distinct from true then
    perform public.enqueue_notification_event_v2(
      'resume_verified', 'interpreter', new.id::text, 'interpreter',
      new.email, null, jsonb_build_object('interpreter_id',new.id,'name',new.name),
      'email','이력서 검증 완료','이력서 검증이 완료되었습니다.',
      null::uuid,null::uuid,new.auth_user_id,new.name
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_interpreter_workflow_notifications on public.interpreters;
create trigger queue_interpreter_workflow_notifications
after update on public.interpreters for each row
execute function public.queue_interpreter_workflow_notifications();

create or replace function public.queue_request_under_review_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare company record;
begin
  if new.contact_status is distinct from 'contacted'
    or old.contact_status is not distinct from 'contacted' then return new; end if;

  select contact_email,company_name,contact_name into company
  from public.businesses where auth_user_id=new.company_auth_user_id;
  company.contact_email := coalesce(nullif(trim(company.contact_email), ''),
    nullif(trim(to_jsonb(new)->>'contact_email'), ''),
    nullif(trim(to_jsonb(new)->>'email'), ''));
  if company.contact_email is null then return new; end if;

  perform public.enqueue_notification_event_v2(
    'company_request_under_review','request',new.id::text,'company',
    company.contact_email,null,
    jsonb_build_object('request_id',new.id,'companyName',company.company_name,
      'contactName',company.contact_name,'eventName',new.event_name),
    'email','통역 의뢰 검토 중','접수하신 통역 의뢰를 검토 중입니다.',
    null::uuid,null::uuid,new.company_auth_user_id,coalesce(company.contact_name,company.company_name)
  );
  return new;
end;
$$;

drop trigger if exists queue_request_under_review_notification on public.requests;
create trigger queue_request_under_review_notification
after update on public.requests for each row
execute function public.queue_request_under_review_notification();

create or replace function public.queue_company_assignment_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare request_row record; company record; interpreter_row record;
begin
  select r.company_auth_user_id,r.company_name,r.event_name,
    coalesce(to_jsonb(r)->>'event_location',to_jsonb(r)->>'location') as event_location,
    coalesce(to_jsonb(r)->>'contact_email',to_jsonb(r)->>'email') as email,
    r.contact_name into request_row
  from public.requests r where r.id=new.request_id;
  select contact_email,company_name,contact_name into company
  from public.businesses where auth_user_id=request_row.company_auth_user_id;
  company.contact_email := coalesce(nullif(trim(company.contact_email), ''), nullif(trim(request_row.email), ''));
  if company.contact_email is null then return new; end if;
  select name into interpreter_row from public.interpreters where id=new.interpreter_id;

  perform public.enqueue_notification_event_v2(
    'company_matching_confirmed','assignment',new.id::text,'company',
    company.contact_email,null,
    jsonb_build_object('request_id',new.request_id,'assignment_id',new.id,
      'companyName',coalesce(company.company_name,request_row.company_name),
      'contactName',coalesce(company.contact_name,request_row.contact_name),
      'eventName',request_row.event_name,
      'interpreterName',interpreter_row.name,'location',request_row.event_location),
    'email','통역사 배정 완료','통역사 배정이 완료되었습니다.',
    null::uuid,null::uuid,request_row.company_auth_user_id,
    coalesce(company.contact_name,request_row.contact_name,company.company_name)
  );
  return new;
end;
$$;

drop trigger if exists queue_company_assignment_notification on public.request_interpreters;
create trigger queue_company_assignment_notification
after insert on public.request_interpreters for each row
execute function public.queue_company_assignment_notification();

revoke all on function public.queue_interpreter_workflow_notifications() from public;
revoke all on function public.queue_request_under_review_notification() from public;
revoke all on function public.queue_company_assignment_notification() from public;
revoke all on function public.enqueue_notification_event_v2(
  text,text,text,text,text,text,jsonb,text,text,text,uuid,uuid,uuid,text
) from public,anon,authenticated;

commit;
