-- Repair interpreter settlement amounts/levels and keep future generated rows
-- aligned with the admin settlement calculator.

alter table public.settlements
add column if not exists applied_level text;

create or replace function public.normalize_settlement_level(p_level text)
returns text
language sql
immutable
as $$
  select case
    when p_level is null or trim(p_level) = '' then null
    when upper(regexp_replace(trim(p_level), '\s+', '', 'g')) in ('LV1', 'L1', '1') then 'LV1'
    when upper(regexp_replace(trim(p_level), '\s+', '', 'g')) in ('LV2', 'L2', '2') then 'LV2'
    when upper(regexp_replace(trim(p_level), '\s+', '', 'g')) in ('LV3', 'L3', '3') then 'LV3'
    when upper(regexp_replace(trim(p_level), '\s+', '', 'g')) in ('LV4', 'L4', '4') then 'LV4'
    else trim(p_level)
  end;
$$;

create or replace function public.get_onli_interpreter_daily_rate(p_level text)
returns numeric
language sql
immutable
as $$
  select case public.normalize_settlement_level(p_level)
    when 'LV1' then 180000
    when 'LV2' then 200000
    when 'LV3' then 230000
    when 'LV4' then 245000
    else null
  end;
$$;

create or replace function public.calculate_request_work_days(request_record public.requests)
returns integer
language sql
stable
as $$
  select greatest(
    1,
    coalesce(
      nullif(request_record.settlement_work_days, 0),
      case
        when request_record.start_date is not null and request_record.end_date is not null
          then (request_record.end_date - request_record.start_date + 1)
        when request_record.start_date is not null or request_record.event_date is not null
          then 1
        else null
      end,
      1
    )
  )::integer;
$$;

create or replace function public.resolve_request_settlement_level(
  request_record public.requests,
  interpreter_level text,
  assignment_level text default null
)
returns text
language sql
stable
as $$
  select coalesce(
    public.normalize_settlement_level(assignment_level),
    public.normalize_settlement_level(request_record.settlement_level),
    public.normalize_settlement_level(interpreter_level)
  );
$$;

create or replace function public.resolve_request_interpreter_daily_rate(
  request_record public.requests,
  applied_level text,
  work_day_count integer
)
returns numeric
language sql
stable
as $$
  select coalesce(
    nullif(round(coalesce(request_record.settlement_base_amount, 0)::numeric / greatest(work_day_count, 1), 0), 0),
    public.get_onli_interpreter_daily_rate(applied_level),
    nullif(request_record.interpreter_fee, 0),
    nullif(request_record.interpreter_pay, 0),
    nullif(round(coalesce(request_record.settlement_final_amount, 0)::numeric / greatest(work_day_count, 1), 0), 0),
    nullif(round(coalesce(request_record.interpreter_payment, 0)::numeric / greatest(work_day_count, 1), 0), 0),
    nullif(round(coalesce(request_record.interpreter_price, 0)::numeric / greatest(work_day_count, 1), 0), 0),
    0
  );
$$;

create or replace function public.ensure_settlements_for_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.requests%rowtype;
  assignment_row record;
  fallback_interpreter_id bigint;
  fallback_auth_user_id uuid;
  payout_doc_id uuid;
  work_day_count integer;
  applied_level_value text;
  day_rate numeric;
  extra_amount_value numeric;
  deduction_amount_value numeric;
  total_amount numeric;
begin
  select * into request_row
  from public.requests
  where id = p_request_id;

  if not found then
    return;
  end if;

  work_day_count := public.calculate_request_work_days(request_row);
  extra_amount_value := coalesce(request_row.settlement_extra_amount, 0);
  deduction_amount_value := coalesce(request_row.settlement_deduction_amount, 0);

  for assignment_row in
    select
      ('request_interpreters:' || ri.id::text) as assignment_id,
      ri.interpreter_id,
      i.auth_user_id as interpreter_auth_user_id,
      i.level as interpreter_level,
      null::text as assignment_level
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = request_row.id
    union
    select
      ('matchings:' || m.id::text) as assignment_id,
      m.interpreter_id,
      i.auth_user_id as interpreter_auth_user_id,
      i.level as interpreter_level,
      null::text as assignment_level
    from public.matchings m
    join public.interpreters i on i.id = m.interpreter_id
    where m.request_id = request_row.id
  loop
    applied_level_value := public.resolve_request_settlement_level(
      request_row,
      assignment_row.interpreter_level,
      assignment_row.assignment_level
    );
    day_rate := public.resolve_request_interpreter_daily_rate(
      request_row,
      applied_level_value,
      work_day_count
    );
    total_amount := greatest(0, (day_rate * work_day_count) + extra_amount_value - deduction_amount_value);

    select d.id into payout_doc_id
    from public.documents d
    where d.request_id = request_row.id
      and d.interpreter_id = assignment_row.interpreter_id
      and d.document_type = 'payout'
      and d.status = 'issued'
    order by d.version desc, d.created_at desc
    limit 1;

    insert into public.settlements (
      request_id,
      interpreter_id,
      interpreter_auth_user_id,
      assignment_id,
      payout_document_id,
      amount,
      payout_status,
      work_days,
      applied_level,
      daily_rate,
      extra_amount,
      deduction_amount,
      paid_at,
      admin_memo
    )
    values (
      request_row.id,
      assignment_row.interpreter_id,
      assignment_row.interpreter_auth_user_id,
      assignment_row.assignment_id,
      payout_doc_id,
      total_amount,
      public.map_legacy_payout_status(request_row.settlement_status),
      work_day_count,
      applied_level_value,
      day_rate,
      extra_amount_value,
      deduction_amount_value,
      case
        when public.map_legacy_payout_status(request_row.settlement_status) = 'paid'
        then coalesce(request_row.settlement_completed_at, request_row.updated_at, now())
        else null
      end,
      request_row.settlement_memo
    )
    on conflict (request_id, interpreter_id) do update
    set interpreter_auth_user_id = coalesce(excluded.interpreter_auth_user_id, public.settlements.interpreter_auth_user_id),
        assignment_id = coalesce(public.settlements.assignment_id, excluded.assignment_id),
        payout_document_id = coalesce(excluded.payout_document_id, public.settlements.payout_document_id),
        amount = case
          when public.settlements.payout_status = 'pending'
            and (coalesce(public.settlements.amount, 0) <= 1 or coalesce(public.settlements.daily_rate, 0) <= 1)
            then excluded.amount
          when public.settlements.payout_status = 'pending'
            then excluded.amount
          else public.settlements.amount
        end,
        payout_status = excluded.payout_status,
        work_days = excluded.work_days,
        applied_level = coalesce(excluded.applied_level, public.settlements.applied_level),
        daily_rate = case
          when public.settlements.payout_status = 'pending'
            then excluded.daily_rate
          else public.settlements.daily_rate
        end,
        extra_amount = excluded.extra_amount,
        deduction_amount = excluded.deduction_amount,
        paid_at = coalesce(public.settlements.paid_at, excluded.paid_at),
        admin_memo = coalesce(excluded.admin_memo, public.settlements.admin_memo);
  end loop;

  if not exists (select 1 from public.settlements s where s.request_id = request_row.id) then
    fallback_interpreter_id := coalesce(request_row.assigned_interpreter_id, request_row.matched_interpreter_id);
    if fallback_interpreter_id is not null then
      select
        public.resolve_request_settlement_level(request_row, i.level, null),
        i.auth_user_id
      into applied_level_value, fallback_auth_user_id
      from public.interpreters i
      where i.id = fallback_interpreter_id
      limit 1;

      day_rate := public.resolve_request_interpreter_daily_rate(request_row, applied_level_value, work_day_count);
      total_amount := greatest(0, (day_rate * work_day_count) + extra_amount_value - deduction_amount_value);

      insert into public.settlements (
        request_id,
        interpreter_id,
        interpreter_auth_user_id,
        amount,
        payout_status,
        work_days,
        applied_level,
        daily_rate,
        extra_amount,
        deduction_amount,
        admin_memo
      )
      select
        request_row.id,
        i.id,
        i.auth_user_id,
        total_amount,
        public.map_legacy_payout_status(request_row.settlement_status),
        work_day_count,
        applied_level_value,
        day_rate,
        extra_amount_value,
        deduction_amount_value,
        request_row.settlement_memo
      from public.interpreters i
      where i.id = fallback_interpreter_id
      on conflict (request_id, interpreter_id) do nothing;
    end if;
  end if;
end;
$$;

with calculated as (
  select
    s.id as settlement_id,
    public.calculate_request_work_days(r) as work_days,
    public.resolve_request_settlement_level(r, i.level, null) as applied_level,
    coalesce(r.settlement_extra_amount, s.extra_amount, 0) as extra_amount,
    coalesce(r.settlement_deduction_amount, s.deduction_amount, 0) as deduction_amount,
    d.id as payout_document_id,
    r as request_row
  from public.settlements s
  join public.requests r on r.id = s.request_id
  left join public.interpreters i on i.id = s.interpreter_id
  left join lateral (
    select doc.id
    from public.documents doc
    where doc.document_type = 'payout'
      and doc.status = 'issued'
      and (
        doc.id = s.payout_document_id
        or doc.settlement_id = s.id::text
        or (
          doc.request_id = s.request_id
          and doc.interpreter_id = s.interpreter_id
        )
      )
    order by doc.version desc, doc.created_at desc
    limit 1
  ) d on true
), amounts as (
  select
    c.*,
    public.resolve_request_interpreter_daily_rate(c.request_row, c.applied_level, c.work_days) as daily_rate
  from calculated c
)
update public.settlements s
set work_days = a.work_days,
    applied_level = coalesce(a.applied_level, s.applied_level),
    daily_rate = a.daily_rate,
    amount = greatest(0, (a.daily_rate * a.work_days) + a.extra_amount - a.deduction_amount),
    extra_amount = a.extra_amount,
    deduction_amount = a.deduction_amount,
    payout_document_id = coalesce(s.payout_document_id, a.payout_document_id),
    updated_at = now()
from amounts a
where s.id = a.settlement_id
  and public.map_legacy_payout_status(s.payout_status) = 'pending'
  and (
    coalesce(s.amount, 0) <= 1
    or coalesce(s.daily_rate, 0) <= 1
    or s.applied_level is null
    or s.applied_level is distinct from a.applied_level
    or s.work_days is null
  );

insert into public.settlement_logs (settlement_id, previous_status, new_status, changed_by, memo)
select s.id, s.payout_status, s.payout_status, auth.uid(), '정산 금액/레벨 백필'
from public.settlements s
where public.map_legacy_payout_status(s.payout_status) = 'pending'
  and coalesce(s.daily_rate, 0) > 1
  and coalesce(s.amount, 0) > 1
  and not exists (
    select 1
    from public.settlement_logs log
    where log.settlement_id = s.id
      and log.memo = '정산 금액/레벨 백필'
  );

notify pgrst, 'reload schema';
