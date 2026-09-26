begin;

create or replace function public.prevent_interpreter_self_admin_field_changes()
returns trigger
language plpgsql security definer set search_path=public,storage,auth,pg_temp as $$
declare account_email text;
begin
  if public.is_active_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null or new.auth_user_id is distinct from auth.uid() then
    raise exception using errcode='42501', message='본인 통역사 프로필만 변경할 수 있습니다.';
  end if;

  if tg_op = 'INSERT' then
    select lower(trim(u.email)) into account_email from auth.users u where u.id=auth.uid();
    if account_email is null or lower(trim(new.email)) is distinct from account_email then
      raise exception using errcode='42501', message='계정 이메일과 프로필 이메일이 다릅니다.';
    end if;
    if new.status is distinct from 'pending' or new.approved is distinct from false
      or new.is_public is distinct from false or new.withdrawn_at is not null
      or lower(coalesce(new.level,'')) <> 'lv1' or coalesce(new.warning_count,0) <> 0
      or new.admin_memo is not null or new.badge_review_status is not null
      or new.resume_verified_email_sent_at is not null
      or new.resume_url is not null or new.resume_file_url is not null
      or new.bankbook_file_url is not null or new.business_license_file_url is not null then
      raise exception using errcode='42501', message='가입 시 운영 필드를 지정할 수 없습니다.';
    end if;
    return new;
  end if;

  if old.auth_user_id is distinct from auth.uid() or new.email is distinct from old.email
    or new.auth_user_id is distinct from old.auth_user_id
    or new.interpreter_no is distinct from old.interpreter_no
    or new.level is distinct from old.level
    or new.warning_count is distinct from old.warning_count
    or new.admin_memo is distinct from old.admin_memo
    or new.badge_review_status is distinct from old.badge_review_status
    or new.resume_verified_email_sent_at is distinct from old.resume_verified_email_sent_at
    or (new.approved is distinct from old.approved and new.approved is distinct from false)
    or (new.is_public is distinct from old.is_public and new.is_public is distinct from false) then
    raise exception using errcode='42501', message='운영 전용 필드는 변경할 수 없습니다.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'withdrawn' and new.is_public = false and new.withdrawn_at is not null then
      null;
    elsif old.status = 'withdrawn' and new.status = 'pending'
      and new.is_public = false and new.withdrawn_at is null and new.approved = false then
      null;
    else
      raise exception using errcode='42501', message='통역사 상태는 관리자 승인으로 변경됩니다.';
    end if;
  elsif new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception using errcode='42501', message='탈퇴 상태를 확인해주세요.';
  end if;

  if new.resume_url is distinct from old.resume_url and new.resume_url is not null then
    raise exception using errcode='42501', message='이력서 경로가 올바르지 않습니다.';
  end if;
  if new.resume_file_url is distinct from old.resume_file_url
    and new.resume_file_url is not null and not (
      left(new.resume_file_url,length(auth.uid()::text||'/'))=auth.uid()::text||'/'
      and exists(select 1 from storage.objects o where o.bucket_id='resume-files' and o.name=new.resume_file_url)
    ) then
    raise exception using errcode='42501', message='이력서 파일을 확인할 수 없습니다.';
  end if;
  if new.bankbook_file_url is distinct from old.bankbook_file_url
    and new.bankbook_file_url is not null and not (
      left(new.bankbook_file_url,length('interpreter-documents/'||auth.uid()::text||'/settlement/bankbook_'))
        ='interpreter-documents/'||auth.uid()::text||'/settlement/bankbook_'
      and exists(select 1 from storage.objects o where o.bucket_id='resume-files' and o.name=new.bankbook_file_url)
    ) then
    raise exception using errcode='42501', message='통장 사본 파일을 확인할 수 없습니다.';
  end if;
  if new.business_license_file_url is distinct from old.business_license_file_url
    and new.business_license_file_url is not null and not (
      left(new.business_license_file_url,length('interpreter-documents/'||auth.uid()::text||'/settlement/business_license_'))
        ='interpreter-documents/'||auth.uid()::text||'/settlement/business_license_'
      and exists(select 1 from storage.objects o where o.bucket_id='resume-files' and o.name=new.business_license_file_url)
    ) then
    raise exception using errcode='42501', message='사업자등록증 파일을 확인할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_interpreter_self_admin_field_changes on public.interpreters;
create trigger prevent_interpreter_self_admin_field_changes
before insert or update on public.interpreters
for each row execute function public.prevent_interpreter_self_admin_field_changes();

commit;
