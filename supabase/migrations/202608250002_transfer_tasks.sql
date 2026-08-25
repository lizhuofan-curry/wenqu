-- 错因迁移题：私有 rubric 与原子评分 claim 只允许服务端访问。
-- 外部 AI 调用不在数据库事务内；claim 只允许 ready 原子切到 evaluating。
-- evaluating 不自动超时回收，避免模型已计费但结果未落库时被重复调用。
-- 第一阶段收紧写权限前的历史记录不自动视为服务端可信；既有行保持 NULL。
alter table public.study_records
  add column if not exists server_verified_at timestamptz;
comment on column public.study_records.server_verified_at
  is 'Non-null only when the application server constructed and wrote the record.';

do $$
begin
  if exists (
    select 1
    from public.study_records
    where session_id ~ '^tr_[0-9a-f]{32}$'
  ) then
    raise exception 'refusing transfer migration: deterministic task id already occupied';
  end if;
end;
$$;

create table if not exists public.transfer_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id text not null,
  material_id text not null,
  source_question_id text not null,
  misconception_code text not null,
  target_label text not null,
  generation_version integer not null,
  material_revision text not null,
  prompt text not null,
  private_rubric text not null,
  evidence jsonb not null,
  status text not null default 'ready',
  claimed_at timestamptz,
  result_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint transfer_tasks_source_record_fkey
    foreign key (source_session_id, user_id)
    references public.study_records (session_id, user_id)
    on delete cascade,
  constraint transfer_tasks_id_check
    check (id ~ '^tr_[0-9a-f]{32}$'),
  constraint transfer_tasks_status_check
    check (status in ('ready', 'evaluating', 'completed')),
  constraint transfer_tasks_generation_check
    check (generation_version > 0),
  constraint transfer_tasks_target_check
    check (
      char_length(misconception_code) between 1 and 80
      and char_length(target_label) between 1 and 80
    ),
  constraint transfer_tasks_payload_check
    check (
      char_length(prompt) between 1 and 1200
      and char_length(private_rubric) between 1 and 2400
    ),
  constraint transfer_tasks_source_unique
    unique (
      user_id,
      source_session_id,
      source_question_id,
      misconception_code,
      generation_version,
      material_revision
    )
);

create index if not exists transfer_tasks_user_status_idx
  on public.transfer_tasks (user_id, status, created_at desc);

alter table public.transfer_tasks enable row level security;
alter table public.transfer_tasks force row level security;

revoke all privileges on table public.transfer_tasks
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.transfer_tasks to service_role;

create or replace function public.claim_transfer_task(
  p_task_id text,
  p_user_id uuid
)
returns table (
  claimed boolean,
  task_status text,
  stored_result jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.transfer_tasks as task
  set
    status = 'evaluating',
    claimed_at = statement_timestamp()
  where task.id = p_task_id
    and task.user_id = p_user_id
    and task.status = 'ready'
  returning true, task.status, task.result_json;

  if found then
    return;
  end if;

  return query
  select false, task.status, task.result_json
  from public.transfer_tasks as task
  where task.id = p_task_id
    and task.user_id = p_user_id;
end;
$$;

revoke all on function public.claim_transfer_task(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_transfer_task(text, uuid)
  to service_role;

