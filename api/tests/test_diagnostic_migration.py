"""Fail-closed SQL boundary checks for private diagnostic attempts."""

from pathlib import Path

MIGRATION = Path("supabase/migrations/202608250004_diagnostic_attempts.sql")


def test_diagnostic_migration_is_private_atomic_versioned_and_server_owned():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "^dg_[0-9a-f]{32}$" in sql
    assert "from public.study_records" in sql
    assert "insert into public.study_records" not in sql
    assert "create table if not exists public.diagnostic_attempts" in sql
    assert "diagnostic_version integer not null" in sql
    assert "unique (user_id, client_request_id)" in sql
    assert "unique (user_id, material_id, material_revision, diagnostic_version)" in sql
    assert "on conflict do nothing" in sql
    assert "attempt.material_revision = p_material_revision" in sql
    assert "attempt.diagnostic_version = p_diagnostic_version" in sql
    assert "(p_question_contract ->> 'scorer_fingerprint') !~ '^[0-9a-f]{64}$'" in sql
    assert "attempt.submission_json = p_submission_json" in sql
    assert "attempt.status = 'evaluating' and attempt.submission_json = p_submission_json" in sql
    assert "force row level security" in sql
    assert "from public, anon, authenticated, service_role" in sql
    assert "grant select on table public.diagnostic_attempts to service_role" in sql
    assert "create policy" not in sql

    for function_name in ("prepare_diagnostic_attempt", "claim_diagnostic_attempt", "complete_diagnostic_attempt"):
        assert f"function public.{function_name}" in sql
    assert sql.count("security definer") == 3
    assert sql.count("set search_path = ''") == 3
    assert sql.count("to service_role") == 4
    assert "to authenticated" not in sql
    assert "text, uuid, uuid, text, text, text, integer, jsonb" in sql
