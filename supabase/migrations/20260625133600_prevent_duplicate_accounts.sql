-- Supabase Migration: Prevent duplicated registrations between businesses and interpreters

-- 1. Scan and report pre-existing duplicate entries
do $$
declare
  dup_record record;
begin
  for dup_record in
    select b.auth_user_id, b.company_name, i.name, i.email
    from public.businesses b
    join public.interpreters i on b.auth_user_id = i.auth_user_id or lower(trim(b.contact_email)) = lower(trim(i.email))
  loop
    raise warning 'Duplicate account registration detected: Auth User ID: %, Business: %, Interpreter Name: %, Email: %',
      dup_record.auth_user_id, dup_record.company_name, dup_record.name, dup_record.email;
  end loop;
end $$;

-- 2. Create trigger function to validate business registration is allowed
create or replace function public.check_business_registration_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.interpreters
    where auth_user_id = new.auth_user_id
       or lower(trim(email)) = lower(trim(new.contact_email))
  ) then
    raise exception 'Already registered as an interpreter. Cannot register as a business.';
  end if;
  return new;
end;
$$;

-- 3. Create trigger function to validate interpreter registration is allowed
create or replace function public.check_interpreter_registration_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.businesses
    where auth_user_id = new.auth_user_id
       or lower(trim(contact_email)) = lower(trim(new.email))
  ) then
    raise exception 'Already registered as a business. Cannot register as an interpreter.';
  end if;
  return new;
end;
$$;

-- 4. Attach validation trigger to businesses
drop trigger if exists check_business_registration_allowed on public.businesses;
create trigger check_business_registration_allowed
before insert on public.businesses
for each row
execute function public.check_business_registration_allowed();

-- 5. Attach validation trigger to interpreters
drop trigger if exists check_interpreter_registration_allowed on public.interpreters;
create trigger check_interpreter_registration_allowed
before insert on public.interpreters
for each row
execute function public.check_interpreter_registration_allowed();

-- Notify schema reload
notify pgrst, 'reload schema';
