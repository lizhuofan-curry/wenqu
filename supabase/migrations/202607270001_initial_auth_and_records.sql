-- 问渠 v.2：真实账号与跨设备学习记录
-- 在 Supabase SQL Editor 中整段执行。所有学习数据均由 RLS 按 auth.uid() 隔离。

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_records (
  session_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id text not null,
  material_title text not null,
  persona_name text not null,
  completed_at timestamptz not null,
  mastery integer not null check (mastery between 0 and 100),
  headline text not null,
  misconception_tags text[] not null default '{}',
  retelling text not null default '',
  answers jsonb not null default '[]'::jsonb,
  session_data jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists study_records_user_completed_idx
  on public.study_records (user_id, completed_at desc);

alter table public.profiles enable row level security;
alter table public.study_records enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "records_select_own" on public.study_records;
create policy "records_select_own"
  on public.study_records for select
  using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.study_records;
create policy "records_insert_own"
  on public.study_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.study_records;
create policy "records_update_own"
  on public.study_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.study_records;
create policy "records_delete_own"
  on public.study_records for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
