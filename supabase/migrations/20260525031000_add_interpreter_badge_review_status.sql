-- Add badge_review_status column to the interpreters table
alter table public.interpreters
add column if not exists badge_review_status text;
