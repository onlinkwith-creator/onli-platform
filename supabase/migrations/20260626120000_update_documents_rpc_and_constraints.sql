-- Supabase Migration: Update document counters prefixes, add get_next_document_no RPC, and adjust documents table unique constraints.

-- 1. Update prefixes in document_counters to include the trailing dash if not already present
update public.document_counters
set prefix = 'ONLI-EST-'
where document_type = 'estimate';

update public.document_counters
set prefix = 'ONLI-COM-'
where document_type = 'completion';

update public.document_counters
set prefix = 'ONLI-PAY-'
where document_type = 'payout';

-- 2. Create the get_next_document_no RPC function
create or replace function public.get_next_document_no(p_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_last_number integer;
  v_next_no text;
begin
  -- Access control check (only active admins can generate document numbers)
  if not public.is_active_admin() then
    raise exception 'Only admins can allocate ON-LI document numbers.';
  end if;

  if p_document_type not in ('estimate', 'completion', 'payout') then
    raise exception 'Unsupported document type: %', p_document_type;
  end if;

  -- Row lock the document counter for the given type
  select prefix, last_number 
  into v_prefix, v_last_number
  from public.document_counters
  where document_type = p_document_type
  for update;

  if not found then
    -- Fail-safe fallback insert
    v_prefix := case p_document_type
      when 'estimate' then 'ONLI-EST-'
      when 'completion' then 'ONLI-COM-'
      when 'payout' then 'ONLI-PAY-'
    end;
    v_last_number := 0;
    
    insert into public.document_counters (document_type, prefix, last_number)
    values (p_document_type, v_prefix, v_last_number);
  end if;

  -- Increment the last_number
  v_last_number := v_last_number + 1;

  -- Update document_counters
  update public.document_counters
  set last_number = v_last_number,
      updated_at = now()
  where document_type = p_document_type;

  -- Construct next document number
  if right(v_prefix, 1) = '-' then
    v_next_no := v_prefix || lpad(v_last_number::text, 4, '0');
  else
    v_next_no := v_prefix || '-' || lpad(v_last_number::text, 4, '0');
  end if;

  return v_next_no;
end;
$$;

-- Revoke all permissions and grant execute to authenticated users (admins)
revoke all on function public.get_next_document_no(text) from public;
grant execute on function public.get_next_document_no(text) to authenticated;

-- 3. Update documents unique constraint
-- The documents table previously set document_no to UNIQUE.
-- We must drop that constraint to allow versioning and add a unique constraint on (document_no, version).
alter table public.documents drop constraint if exists documents_document_no_key;
alter table public.documents drop constraint if exists documents_document_no_version_key;
alter table public.documents add constraint documents_document_no_version_key unique (document_no, version);

-- Notify schema cache reload
notify pgrst, 'reload schema';
