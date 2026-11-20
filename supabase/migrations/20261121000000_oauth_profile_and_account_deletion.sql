-- 第三方登入（Google／Facebook）與帳號刪除（PRD F1、AC1.6–1.9）

-- 1. 新使用者：帶入第三方登入提供的名稱（Google: full_name／name；Facebook: full_name／name）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 100), '')
  );
  return new;
end;
$$;

-- 2. 使用者刪除自己的帳號；只能刪 auth.uid() 本人。
--    auth.users → profiles → analysis_jobs → posts / analysis_results / job_logs 皆為 on delete cascade。
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
