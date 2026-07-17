-- The existing conditional index already enforces one active application per
-- interpreter and job. Remove the duplicate index introduced by the schema
-- repair while retaining job_applications_job_interpreter_uidx.
drop index if exists public.job_applications_job_interpreter_unique;
