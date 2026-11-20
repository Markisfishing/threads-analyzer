-- Worker 以 service_role 寫入資料；新版 Supabase 專案不會自動授權 public schema 新表給 service_role。
grant usage on schema public to service_role;

grant select, insert, update, delete
  on public.profiles, public.analysis_jobs, public.posts,
     public.analysis_results, public.job_logs
  to service_role;

-- identity 欄位（posts.id、job_logs.id）的 sequence
grant usage, select on all sequences in schema public to service_role;
