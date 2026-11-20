-- 修正：analysis_jobs 的 insert policy 在子查詢中查同一張表，觸發 RLS 無限遞迴（42P17）。
-- 改用 security definer 函式檢查 parent_job_id 是否屬於目前使用者（函式內不套用 RLS）。

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.analysis_jobs
    where id = p_job_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_job(uuid) from public, anon;
grant execute on function private.owns_job(uuid) to authenticated;

drop policy "jobs: create own" on public.analysis_jobs;

create policy "jobs: create own" on public.analysis_jobs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (parent_job_id is null or private.owns_job(parent_job_id))
  );
