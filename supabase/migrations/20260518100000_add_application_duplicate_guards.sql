alter table public.job_applications
add column if not exists applicant_email text;

alter table public.job_applications
add column if not exists applicant_phone text;

alter table public.job_applications
add column if not exists interpreter_id bigint references public.interpreters(id) on delete set null;

update public.job_applications
set
  email = nullif(lower(trim(email)), ''),
  applicant_email = nullif(lower(trim(coalesce(applicant_email, email))), ''),
  phone = nullif(regexp_replace(coalesce(phone, ''), '[\s\-\(\)]', '', 'g'), ''),
  applicant_phone = nullif(
    regexp_replace(coalesce(applicant_phone, phone, ''), '[\s\-\(\)]', '', 'g'),
    ''
  );

create unique index if not exists job_applications_job_applicant_email_uidx
on public.job_applications(job_id, applicant_email)
where applicant_email is not null and applicant_email <> '';

create unique index if not exists job_applications_job_applicant_phone_uidx
on public.job_applications(job_id, applicant_phone)
where applicant_phone is not null and applicant_phone <> '';

create unique index if not exists job_applications_job_interpreter_uidx
on public.job_applications(job_id, interpreter_id)
where interpreter_id is not null;

create index if not exists job_applications_applicant_phone_idx
on public.job_applications(applicant_phone);

alter table public.applications
add column if not exists applicant_email text;

alter table public.applications
add column if not exists applicant_phone text;

alter table public.applications
add column if not exists interpreter_id bigint references public.interpreters(id) on delete set null;

update public.applications
set
  email = nullif(lower(trim(email)), ''),
  applicant_email = nullif(lower(trim(coalesce(applicant_email, email))), ''),
  phone = nullif(regexp_replace(coalesce(phone, ''), '[\s\-\(\)]', '', 'g'), ''),
  applicant_phone = nullif(
    regexp_replace(coalesce(applicant_phone, phone, ''), '[\s\-\(\)]', '', 'g'),
    ''
  );

create unique index if not exists applications_job_applicant_email_uidx
on public.applications(job_id, applicant_email)
where applicant_email is not null and applicant_email <> '';

create unique index if not exists applications_job_applicant_phone_uidx
on public.applications(job_id, applicant_phone)
where applicant_phone is not null and applicant_phone <> '';

create unique index if not exists applications_job_interpreter_uidx
on public.applications(job_id, interpreter_id)
where interpreter_id is not null;
