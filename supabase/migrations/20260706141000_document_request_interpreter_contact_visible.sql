alter table public.request_interpreters
add column if not exists contact_visible boolean not null default false;

comment on column public.request_interpreters.contact_visible
is '기업 페이지에 배정 통역사 연락처를 공개할지 여부';

notify pgrst, 'reload schema';
