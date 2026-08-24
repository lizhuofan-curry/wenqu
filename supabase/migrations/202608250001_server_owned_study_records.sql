-- 学习评分档案只允许服务端写入；登录用户只能读取自己的记录。
-- 重试仍由服务端验证签名恢复凭据后执行不可变、幂等插入。

alter table public.study_records enable row level security;
alter table public.study_records force row level security;

drop policy if exists "records_insert_own" on public.study_records;
drop policy if exists "records_update_own" on public.study_records;
drop policy if exists "records_delete_own" on public.study_records;

drop policy if exists "records_select_own" on public.study_records;
create policy "records_select_own"
  on public.study_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.study_records from public, anon, authenticated;
grant select on table public.study_records to authenticated;

revoke all privileges on table public.study_records from service_role;
grant select, insert on table public.study_records to service_role;
