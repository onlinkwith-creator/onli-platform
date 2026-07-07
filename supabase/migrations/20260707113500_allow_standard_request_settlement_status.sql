alter table public.requests
  drop constraint if exists requests_settlement_status_flow_check;

alter table public.requests
  add constraint requests_settlement_status_flow_check
  check (
    settlement_status is null
    or settlement_status = any (
      array[
        'not_required',
        'pending',
        'confirmed',
        'completed',
        'on_hold',
        'settlement_pending',
        'settlement_confirmed',
        'settlement_paid'
      ]::text[]
    )
  );
