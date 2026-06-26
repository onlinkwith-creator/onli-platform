alter table public.documents
add column if not exists voided_at timestamptz,
add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.documents
drop constraint if exists documents_document_no_key;

create unique index if not exists documents_document_no_version_key
on public.documents(document_no, version);

notify pgrst, 'reload schema';
