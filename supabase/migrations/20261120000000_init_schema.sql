-- ============================================================
-- Threads Analyzer：初始資料表與 RLS（PRD §4）
--   profiles / analysis_jobs / posts / analysis_results / job_logs
-- 權限原則：
--   anon           ：任何表都不可存取
--   authenticated  ：只能讀自己的資料；任務只能新增、取消、刪除自己的
--   service_role   ：Worker 使用，繞過 RLS 讀寫全部
-- ============================================================

-- ---------- 共用：updated_at 自動更新 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles：使用者資料（= auth.users）
-- ============================================================
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

-- 註冊時自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- analysis_jobs：分析任務
-- ============================================================
create table public.analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_username text not null check (target_username ~ '^[a-z0-9._]{1,30}$'),
  max_posts       int  not null default 30 check (max_posts between 30 and 100),
  status          text not null default 'queued' check (status in
                    ('queued', 'scraping', 'cleaning', 'analyzing',
                     'completed', 'partial', 'failed', 'cancelled')),
  scraped_count   int  not null default 0 check (scraped_count >= 0),
  error_code      text,
  error_message   text,
  attempt         int  not null default 0,
  parent_job_id   uuid references public.analysis_jobs (id) on delete set null,
  account_meta    jsonb,
  scrape_mode     text check (scrape_mode in ('anonymous', 'authenticated')),
  run_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),  -- Worker 心跳，用於偵測殭屍任務（E10）
  started_at      timestamptz,
  finished_at     timestamptz
);

create index analysis_jobs_user_created_idx on public.analysis_jobs (user_id, created_at desc);
create index analysis_jobs_status_idx on public.analysis_jobs (status) where status in ('queued', 'scraping', 'cleaning', 'analyzing');

-- 同一使用者、同一帳號同時只能有一個進行中任務（E7）
create unique index analysis_jobs_one_active_per_target
  on public.analysis_jobs (user_id, target_username)
  where status in ('queued', 'scraping', 'cleaning', 'analyzing');

create trigger analysis_jobs_set_updated_at
  before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

-- ============================================================
-- posts：貼文資料
-- ============================================================
create table public.posts (
  id              bigint generated always as identity primary key,
  job_id          uuid not null references public.analysis_jobs (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  post_id         text not null,
  post_url        text not null,
  published_at    timestamptz,
  text            text,
  views           int,            -- 公開頁面不可得，保留為 NULL
  likes           int,
  replies         int,
  reposts         int,
  quotes          int,
  char_count      int,
  hashtag_count   int,
  mention_count   int,
  url_count       int,
  emoji_count     int,
  post_types      text[],
  hashtags        text[],
  mentions        text[],
  engagement      numeric,
  engagement_rate numeric,
  score           numeric,
  group_label     text check (group_label in ('high', 'mid', 'low')),
  is_outlier      boolean,
  missing_fields  text[],
  raw_json        jsonb,
  scraped_at      timestamptz not null default now(),
  unique (job_id, post_id)
);

create index posts_job_idx on public.posts (job_id);
create index posts_user_idx on public.posts (user_id);

-- ============================================================
-- analysis_results：彙總分析結果（一任務一筆）
-- ============================================================
create table public.analysis_results (
  job_id     uuid primary key references public.analysis_jobs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  summary    jsonb not null,
  top_posts  jsonb not null,
  groups     jsonb,
  insights   jsonb not null,
  generator  text  not null,
  created_at timestamptz not null default now()
);

create index analysis_results_user_idx on public.analysis_results (user_id);

-- ============================================================
-- job_logs：爬取／分析日誌
-- ============================================================
create table public.job_logs (
  id         bigint generated always as identity primary key,
  job_id     uuid not null references public.analysis_jobs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  level      text not null check (level in ('info', 'warn', 'error')),
  step       text not null check (step in ('scrape', 'clean', 'analyze', 'llm', 'system')),
  message    text not null,
  created_at timestamptz not null default now()
);

create index job_logs_job_idx on public.job_logs (job_id, created_at);

-- ============================================================
-- 權限：先收回預設權限，再依角色明確授權
-- ============================================================
revoke all on public.profiles, public.analysis_jobs, public.posts,
              public.analysis_results, public.job_logs
  from anon, authenticated;

-- authenticated：可讀自己的全部資料
grant select on public.profiles, public.analysis_jobs, public.posts,
                public.analysis_results, public.job_logs
  to authenticated;

-- authenticated：profile 只能改顯示名稱
grant update (display_name) on public.profiles to authenticated;

-- authenticated：建立任務只能填這些欄位，其他欄位（status 等）由預設值或 Worker 決定
grant insert (user_id, target_username, max_posts, parent_job_id) on public.analysis_jobs to authenticated;

-- authenticated：任務只能改 status（且 RLS 限定只能改成 cancelled）
grant update (status) on public.analysis_jobs to authenticated;

grant delete on public.analysis_jobs to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.analysis_jobs    enable row level security;
alter table public.posts            enable row level security;
alter table public.analysis_results enable row level security;
alter table public.job_logs         enable row level security;

-- profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- analysis_jobs
create policy "jobs: read own" on public.analysis_jobs
  for select to authenticated using (user_id = (select auth.uid()));

create policy "jobs: create own" on public.analysis_jobs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      parent_job_id is null
      or exists (select 1 from public.analysis_jobs p
                 where p.id = parent_job_id and p.user_id = (select auth.uid()))
    )
  );

-- 只能把自己「進行中」的任務改為 cancelled
create policy "jobs: cancel own active" on public.analysis_jobs
  for update to authenticated
  using (user_id = (select auth.uid())
         and status in ('queued', 'scraping', 'cleaning', 'analyzing'))
  with check (user_id = (select auth.uid()) and status = 'cancelled');

-- 只能刪除自己「已結束」的任務（進行中需先取消）
create policy "jobs: delete own finished" on public.analysis_jobs
  for delete to authenticated
  using (user_id = (select auth.uid())
         and status in ('completed', 'partial', 'failed', 'cancelled'));

-- posts / analysis_results / job_logs：只讀自己的
create policy "posts: read own" on public.posts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "results: read own" on public.analysis_results
  for select to authenticated using (user_id = (select auth.uid()));
create policy "logs: read own" on public.job_logs
  for select to authenticated using (user_id = (select auth.uid()));
