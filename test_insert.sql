begin;

insert into public.job_applications (
  job_id,
  interpreter_id,
  applicant_name,
  email,
  message,
  status,
  agreed_terms,
  agreed_policy,
  agreed_cancel_policy,
  agreed_at,
  cancel_policy_agreed_at
)
values (
  'abf57457-aa89-443d-96e3-b67c53e7c420',
  87,
  'DB trigger test',
  'test@example.com',
  'trigger test',
  'pending',
  true,
  true,
  true,
  now(),
  now()
)
returning id;

rollback;
