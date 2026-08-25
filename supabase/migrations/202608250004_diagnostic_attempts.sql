-- Diagnostics never write study_records; fail closed if their namespace was occupied.
do $$
begin
  if exists (
    select 1 from public.study_records where session_id ~ '^dg_[0-9a-f]{32}$'
  ) then
    raise exception 'refusing diagnostic migration: deterministic diagnostic id already occupied';
  end if;
end
$$;

create table if not exists public.diagnostic_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  material_id text not null,
  material_title text not null,
  material_revision text not null,
  diagnostic_version integer not null,
  question_contract jsonb not null,
  submission_json jsonb,
  status text not null default 'ready',
  result_json jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  constraint diagnostic_attempts_id_check check (id ~ '^dg_[0-9a-f]{32}$'),
  constraint diagnostic_attempts_material_check check (material_id = 'senet-cvpr-2018'),
  constraint diagnostic_attempts_revision_check check (material_revision ~ '^[0-9a-f]{64}$'),
  constraint diagnostic_attempts_version_check check (diagnostic_version > 0),
  constraint diagnostic_attempts_status_check check (status in ('ready', 'evaluating', 'completed')),
  constraint diagnostic_attempts_request_unique unique (user_id, client_request_id),
  constraint diagnostic_attempts_first_baseline_unique
    unique (user_id, material_id, material_revision, diagnostic_version)
);

create index if not exists diagnostic_attempts_user_created_idx
  on public.diagnostic_attempts (user_id, created_at desc);

alter table public.diagnostic_attempts enable row level security;
alter table public.diagnostic_attempts force row level security;
revoke all privileges on table public.diagnostic_attempts
  from public, anon, authenticated, service_role;
grant select on table public.diagnostic_attempts to service_role;

create or replace function public.prepare_diagnostic_attempt(
  p_id text,
  p_user_id uuid,
  p_client_request_id uuid,
  p_material_id text,
  p_material_title text,
  p_material_revision text,
  p_diagnostic_version integer,
  p_question_contract jsonb
)
returns setof public.diagnostic_attempts
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id !~ '^dg_[0-9a-f]{32}$'
    or p_material_id <> 'senet-cvpr-2018'
    or char_length(p_material_title) not between 1 and 500
    or p_material_revision !~ '^[0-9a-f]{64}$'
    or p_diagnostic_version <> 1
    or jsonb_typeof(p_question_contract) <> 'object'
    or p_question_contract ->> 'diagnostic_version' <> p_diagnostic_version::text
    or (p_question_contract ->> 'rubric_fingerprint') !~ '^[0-9a-f]{64}$'
    or (p_question_contract ->> 'scorer_fingerprint') !~ '^[0-9a-f]{64}$'
  then
    return;
  end if;

  insert into public.diagnostic_attempts (
    id, user_id, client_request_id, material_id, material_title,
    material_revision, diagnostic_version, question_contract
  )
  values (
    p_id, p_user_id, p_client_request_id, p_material_id, p_material_title,
    p_material_revision, p_diagnostic_version, p_question_contract
  )
  on conflict do nothing;

  return query
  select attempt.*
  from public.diagnostic_attempts as attempt
  where attempt.user_id = p_user_id
    and attempt.material_id = p_material_id
    and attempt.material_revision = p_material_revision
    and attempt.diagnostic_version = p_diagnostic_version;
end;
$$;

create or replace function public.claim_diagnostic_attempt(
  p_id text,
  p_user_id uuid,
  p_material_revision text,
  p_submission_json jsonb
)
returns table (claimed boolean, task_status text, stored_result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_submission_json) <> 'object' then
    return;
  end if;

  return query
  update public.diagnostic_attempts as attempt
  set status = 'evaluating', submission_json = p_submission_json, claimed_at = statement_timestamp()
  where attempt.id = p_id
    and attempt.user_id = p_user_id
    and attempt.material_revision = p_material_revision
    and attempt.status = 'ready'
  returning true, attempt.status, attempt.result_json;

  if found then
    return;
  end if;

  -- This scorer is deterministic and invokes no external provider. An identical
  -- JSON submission may safely resume after a process died between claim/complete.
  return query
  select
    (attempt.status = 'evaluating' and attempt.submission_json = p_submission_json),
    attempt.status,
    attempt.result_json
  from public.diagnostic_attempts as attempt
  where attempt.id = p_id
    and attempt.user_id = p_user_id
    and attempt.material_revision = p_material_revision;
end;
$$;

create or replace function public.complete_diagnostic_attempt(
  p_id text,
  p_user_id uuid,
  p_material_revision text,
  p_result_json jsonb
)
returns setof public.diagnostic_attempts
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.diagnostic_attempts as attempt
  set status = 'completed', result_json = p_result_json, completed_at = statement_timestamp()
  where attempt.id = p_id
    and attempt.user_id = p_user_id
    and attempt.material_revision = p_material_revision
    and attempt.status = 'evaluating'
    and jsonb_typeof(p_result_json) = 'object'
  returning attempt.*;

  if found then
    return;
  end if;

  return query
  select attempt.*
  from public.diagnostic_attempts as attempt
  where attempt.id = p_id
    and attempt.user_id = p_user_id
    and attempt.material_revision = p_material_revision
    and attempt.status = 'completed';
end;
$$;

revoke all on function public.prepare_diagnostic_attempt(
  text, uuid, uuid, text, text, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.claim_diagnostic_attempt(
  text, uuid, text, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_diagnostic_attempt(
  text, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.prepare_diagnostic_attempt(
  text, uuid, uuid, text, text, text, integer, jsonb
) to service_role;
grant execute on function public.claim_diagnostic_attempt(
  text, uuid, text, jsonb
) to service_role;
grant execute on function public.complete_diagnostic_attempt(
  text, uuid, text, jsonb
) to service_role;
