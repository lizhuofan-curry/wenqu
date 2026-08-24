-- 问渠安全加固：上传材料归属、严格 RLS 与服务端 AI 每日配额。
-- 历史 materials 行保留为 user_id is null；普通用户策略不会读取或修改这些行。

alter table public.materials
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_user_id_fkey'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_reserved_id_check'
      and conrelid = 'public.materials'::regclass
  ) then
    alter table public.materials
      add constraint materials_reserved_id_check
      check (id <> 'senet-cvpr-2018') not valid;
  end if;
end
$$;

create index if not exists materials_user_id_idx
  on public.materials (user_id);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.study_records enable row level security;
alter table public.study_records force row level security;
alter table public.materials enable row level security;
alter table public.materials force row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "records_select_own" on public.study_records;
create policy "records_select_own"
  on public.study_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "records_insert_own" on public.study_records;
create policy "records_insert_own"
  on public.study_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "records_update_own" on public.study_records;
create policy "records_update_own"
  on public.study_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "records_delete_own" on public.study_records;
create policy "records_delete_own"
  on public.study_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Anyone can read materials" on public.materials;
drop policy if exists "Authenticated users can insert materials" on public.materials;
drop policy if exists "Authenticated users can update their own materials" on public.materials;
drop policy if exists "materials_select_own" on public.materials;
drop policy if exists "materials_insert_own" on public.materials;
drop policy if exists "materials_update_own" on public.materials;
drop policy if exists "materials_delete_own" on public.materials;

create policy "materials_select_own"
  on public.materials for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "materials_insert_own"
  on public.materials for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "materials_update_own"
  on public.materials for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "materials_delete_own"
  on public.materials for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.materials from public, anon, authenticated;
grant select, insert, update, delete on table public.materials to service_role;

create table if not exists public.ai_quota_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_date date not null,
  action text not null,
  usage_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_quota_usage_pkey primary key (user_id, quota_date, action),
  constraint ai_quota_usage_action_check
    check (action in ('evaluate', 'upload', 'regenerate')),
  constraint ai_quota_usage_count_check check (usage_count >= 0)
);

alter table public.ai_quota_usage enable row level security;
alter table public.ai_quota_usage force row level security;

-- The quota table is reachable only through the security-definer RPC below.
-- In particular, even service_role receives no direct table privilege.
revoke all privileges on table public.ai_quota_usage
  from public, anon, authenticated, service_role;

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := lower(btrim(p_action));
  v_limit integer;
  v_usage_count integer;
  v_quota_date date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if p_user_id is null then
    return false;
  end if;

  v_limit := case v_action
    when 'evaluate' then 50
    when 'upload' then 10
    when 'regenerate' then 10
    else null
  end;

  if v_limit is null then
    return false;
  end if;

  -- INSERT ... ON CONFLICT locks the unique quota row and conditionally
  -- increments it in one statement, so concurrent requests cannot overspend.
  insert into public.ai_quota_usage (
    user_id,
    quota_date,
    action,
    usage_count,
    updated_at
  )
  values (
    p_user_id,
    v_quota_date,
    v_action,
    1,
    statement_timestamp()
  )
  on conflict (user_id, quota_date, action) do update
    set usage_count = public.ai_quota_usage.usage_count + 1,
        updated_at = statement_timestamp()
    where public.ai_quota_usage.usage_count < v_limit
  returning usage_count into v_usage_count;

  return v_usage_count is not null;
end
$$;

revoke all privileges on function public.consume_ai_quota(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;
