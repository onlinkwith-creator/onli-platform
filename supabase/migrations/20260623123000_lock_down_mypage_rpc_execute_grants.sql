-- Ensure interpreter mypage RPCs are callable only by authenticated users.

revoke all on function public.get_my_job_applications() from public;
revoke all on function public.get_my_job_applications() from anon;
revoke all on function public.get_my_assignments() from public;
revoke all on function public.get_my_assignments() from anon;

grant execute on function public.get_my_job_applications() to authenticated;
grant execute on function public.get_my_assignments() to authenticated;

notify pgrst, 'reload schema';
