begin;

-- The 11-argument compatibility overload has a default final argument, so a
-- 10-argument call can match both overloads and fails with PostgreSQL 42725.
drop function if exists public.enqueue_backoffice_notification(
  text, text, text, text, uuid, text, text, text, uuid, text, text
);

-- Keep one payment status trigger. Older migrations left two legacy triggers
-- pointing at the same trigger function, which could duplicate logs/notices.
drop trigger if exists log_payment_status_insert on public.payments;
drop trigger if exists log_payment_status_update on public.payments;
drop trigger if exists log_payment_status_change on public.payments;

create or replace function public.log_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_company record;
  v_email text;
  v_phone text;
  v_recipient_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.payment_logs (payment_id, previous_status, new_status, changed_by, memo)
    values (new.id, null, new.payment_status, auth.uid(), new.admin_memo);
    return new;
  end if;

  if new.payment_status is not distinct from old.payment_status then
    return new;
  end if;

  insert into public.payment_logs (payment_id, previous_status, new_status, changed_by, memo)
  values (new.id, old.payment_status, new.payment_status, auth.uid(), new.admin_memo);

  select * into v_request from public.requests where id = new.request_id;

  if new.company_id is not null then
    select * into v_company from public.businesses where id = new.company_id;
  elsif v_request.company_auth_user_id is not null then
    select * into v_company
    from public.businesses
    where auth_user_id = v_request.company_auth_user_id
    limit 1;
  end if;

  v_email := coalesce(
    v_company.contact_email,
    to_jsonb(v_request)->>'email',
    to_jsonb(v_request)->>'contact_email'
  );
  v_phone := coalesce(v_company.contact_phone, to_jsonb(v_request)->>'phone');
  v_recipient_id := coalesce(v_company.auth_user_id, v_request.company_auth_user_id);

  if new.payment_status = 'invoice_sent' then
    perform public.enqueue_backoffice_notification(
      'company_payment_invoice_sent'::text,
      'company'::text,
      '입금 안내'::text,
      '입금 안내가 발송되었습니다.'::text,
      v_recipient_id::uuid,
      v_email::text,
      v_phone::text,
      new.request_id::text,
      new.estimate_document_id::uuid,
      'email'::text
    );
  elsif new.payment_status = 'paid' then
    perform public.enqueue_backoffice_notification(
      'company_payment_paid'::text,
      'company'::text,
      '입금 확인'::text,
      '입금이 확인되었습니다.'::text,
      v_recipient_id::uuid,
      v_email::text,
      v_phone::text,
      new.request_id::text,
      new.estimate_document_id::uuid,
      'email'::text
    );
  elsif new.payment_status = 'overdue' then
    perform public.enqueue_backoffice_notification(
      'company_payment_overdue'::text,
      'company'::text,
      '입금 기한 초과'::text,
      '입금 기한이 지났습니다.'::text,
      v_recipient_id::uuid,
      v_email::text,
      v_phone::text,
      new.request_id::text,
      new.estimate_document_id::uuid,
      'email'::text
    );

    perform public.enqueue_backoffice_notification(
      'admin_payment_overdue'::text,
      'admin'::text,
      '결제 연체 확인 필요'::text,
      '연체 상태의 결제 건을 확인해주세요.'::text,
      null::uuid,
      null::text,
      null::text,
      new.request_id::text,
      new.estimate_document_id::uuid,
      'email'::text
    );
  end if;

  return new;
end;
$$;

create trigger log_payment_status_change
after insert or update of payment_status on public.payments
for each row
execute function public.log_payment_status_change();

revoke all on function public.log_payment_status_change() from public;
grant execute on function public.log_payment_status_change() to authenticated, service_role;

-- Preserve the existing permissions of the canonical 10-argument function.
revoke all on function public.enqueue_backoffice_notification(
  text, text, text, text, uuid, text, text, text, uuid, text
) from public;
grant execute on function public.enqueue_backoffice_notification(
  text, text, text, text, uuid, text, text, text, uuid, text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
