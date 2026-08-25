begin;

-- Historical review rows predate the trusted measurement contract and remain
-- readable as archive evidence, but they are intentionally excluded from this
-- uniqueness boundary and from retention-v1 metrics.
do $$
begin
  if exists (
    select 1
    from public.study_records
    where session_data #>> '{review,measurement_version}' = '1'
    group by
      user_id,
      session_data #>> '{review,source_session_id}',
      session_data #>> '{review,interval_days}'
    having count(*) > 1
  ) then
    raise exception
      'duplicate retention-v1 measurements exist; resolve them before migration';
  end if;
end
$$;


create table if not exists public.retention_measurement_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id text not null,
  interval_days smallint not null check (interval_days in (1, 3, 7)),
  session_id text not null unique,
  claimed_at timestamptz not null default now(),
  primary key (user_id, source_session_id, interval_days)
);

alter table public.retention_measurement_claims enable row level security;
alter table public.retention_measurement_claims force row level security;

revoke all on table public.retention_measurement_claims from public;
revoke all on table public.retention_measurement_claims from anon;
revoke all on table public.retention_measurement_claims from authenticated;
grant select, insert, update, delete
  on table public.retention_measurement_claims to service_role;

create or replace function public.claim_retention_measurement(
  p_user_id uuid,
  p_source_session_id text,
  p_interval_days smallint,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if p_interval_days not in (1, 3, 7) then
    return false;
  end if;

  insert into public.retention_measurement_claims (
    user_id,
    source_session_id,
    interval_days,
    session_id
  )
  values (
    p_user_id,
    p_source_session_id,
    p_interval_days,
    p_session_id
  )
  on conflict (user_id, source_session_id, interval_days) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke all on function public.claim_retention_measurement(
  uuid, text, smallint, text
) from public;
revoke all on function public.claim_retention_measurement(
  uuid, text, smallint, text
) from anon;
revoke all on function public.claim_retention_measurement(
  uuid, text, smallint, text
) from authenticated;
grant execute on function public.claim_retention_measurement(
  uuid, text, smallint, text
) to service_role;
create unique index if not exists
  study_records_unique_retention_measurement_v1
on public.study_records (
  user_id,
  (session_data #>> '{review,source_session_id}'),
  ((session_data #>> '{review,interval_days}')::integer)
)
where
  session_data #>> '{review,measurement_version}' = '1'
  and session_data #>> '{review,source_session_id}' is not null
  and session_data #>> '{review,interval_days}' in ('1', '3', '7');

comment on index public.study_records_unique_retention_measurement_v1 is
  'One trusted D1/D3/D7 measurement per user and source baseline.';

-- The table remains server-owned under the RLS/privilege boundary established
-- by 202608250001_server_owned_study_records.sql.  This migration grants no new
-- client privilege and creates no client-writable policy.

commit;
