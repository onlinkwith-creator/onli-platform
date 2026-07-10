-- Prevent duplicate active applications by authenticated interpreter identity.
-- Cancelled applications are historical and must not block reapplication.

drop index if exists public.job_applications_job_applicant_email_uidx;
drop index if exists public.job_applications_job_applicant_phone_uidx;
drop index if exists public.job_applications_job_interpreter_uidx;

create unique index job_applications_job_interpreter_uidx
on public.job_applications(job_id, interpreter_id)
where interpreter_id is not null
  and coalesce(status, 'pending') <> 'cancelled';
