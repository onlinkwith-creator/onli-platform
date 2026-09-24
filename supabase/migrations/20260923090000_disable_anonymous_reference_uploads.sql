begin;

-- The active request form uploads to request-files as an authenticated user.
-- This legacy bucket must not accept anonymous, unlinked objects.
drop policy if exists "Allow public request reference uploads" on storage.objects;

commit;
