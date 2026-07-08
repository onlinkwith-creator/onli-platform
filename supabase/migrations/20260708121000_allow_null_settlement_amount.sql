alter table public.settlements
alter column amount drop not null;

notify pgrst, 'reload schema';
