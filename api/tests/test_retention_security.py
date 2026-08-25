from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from api import index


def _request(interval: int = 1):
    return index.EvaluationRequest(
        answers=[
            {"question_id": "q1", "response": "a"},
            {"question_id": "q2", "response": "b"},
            {"question_id": "q3", "response": "c"},
        ],
        retelling="足够长的可信复述。",
        material_id="senet-cvpr-2018",
        persona_id="huangfeng",
        expected_user_id="user-a",
        review_source_session_id="source-session",
        review_interval_days=interval,
    )


def _source(*, age_days: float = 2, data: dict | None = None):
    completed = datetime.now(UTC) - timedelta(days=age_days)
    return {
        "session_id": "source-session",
        "material_id": "senet-cvpr-2018",
        "completed_at": completed.isoformat(),
        "server_verified_at": completed.isoformat(),
        "session_data": data
        if data is not None
        else {
            "rubric_fingerprint": index.material_rubric_fingerprint(
                index.SENET_MATERIAL
            ),
            "result": {"question_results": []},
        },
    }


def _configure(monkeypatch, source, prior=None):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)

    def lookup(path):
        if "session_data->review->>source_session_id" in path:
            return prior or []
        return [source]

    monkeypatch.setattr(index, "_supa_get", lookup)


def _validate():
    return index._validated_review_link(
        _request(),
        "user-a",
        deepcopy(index.SENET_MATERIAL),
        "new-session",
    )


def test_review_rejects_unverified_or_derived_source(monkeypatch):
    unverified = _source()
    unverified["server_verified_at"] = None
    _configure(monkeypatch, unverified)
    with pytest.raises(HTTPException) as rejected:
        _validate()
    assert rejected.value.status_code == 422

    derived_data = deepcopy(_source()["session_data"])
    derived_data["review"] = {
        "source_session_id": "older",
        "interval_days": 1,
    }
    _configure(monkeypatch, _source(data=derived_data))
    with pytest.raises(HTTPException) as rejected:
        _validate()
    assert rejected.value.status_code == 422


def test_review_rejects_early_submission_using_server_clock(monkeypatch):
    _configure(monkeypatch, _source(age_days=0.99))
    with pytest.raises(HTTPException) as rejected:
        _validate()
    assert rejected.value.status_code == 425


def test_review_rejects_changed_rubric(monkeypatch):
    changed = deepcopy(_source()["session_data"])
    changed["rubric_fingerprint"] = "0" * 64
    _configure(monkeypatch, _source(data=changed))
    with pytest.raises(HTTPException) as rejected:
        _validate()
    assert rejected.value.status_code == 409


def test_review_rejects_duplicate_trusted_interval(monkeypatch):
    prior = [
        {
            "session_id": "existing-review",
            "server_verified_at": datetime.now(UTC).isoformat(),
            "session_data": {
                "review": {
                    "source_session_id": "source-session",
                    "interval_days": 1,
                    "measurement_version": 1,
                }
            },
        }
    ]
    _configure(monkeypatch, _source(), prior)
    with pytest.raises(HTTPException) as rejected:
        _validate()
    assert rejected.value.status_code == 409


def test_review_ignores_unverified_historical_duplicate(monkeypatch):
    prior = [
        {
            "session_id": "historical-review",
            "server_verified_at": None,
            "session_data": {
                "review": {
                    "source_session_id": "source-session",
                    "interval_days": 1,
                    "measurement_version": 1,
                }
            },
        }
    ]
    _configure(monkeypatch, _source(), prior)

    link = _validate()

    assert link["prior_completed_intervals"] == []


def test_retention_migration_is_partial_unique_and_fail_closed():
    sql = Path(
        "supabase/migrations/202608250003_retention_measurements.sql"
    ).read_text(encoding="utf-8")
    assert "having count(*) > 1" in sql
    assert "raise exception" in sql
    assert "create unique index if not exists" in sql
    assert "measurement_version}' = '1'" in sql
    assert "server_verified_at is not null" in sql
    assert "force row level security" in sql.lower()
    assert "claim_retention_measurement" in sql
    assert "to service_role;" in sql
    assert "to authenticated;" not in sql
    assert "revoke all on table public.retention_measurement_claims from service_role" in sql
    assert "set search_path = ''" in sql
    assert not sql.lstrip().lower().startswith("begin;")
    assert not sql.rstrip().lower().endswith("commit;")


def test_review_claim_is_atomic_and_happens_before_scoring(monkeypatch):
    link = {
        "source_session_id": "source-session",
        "interval_days": 1,
    }
    calls = []

    def claim(name, body):
        calls.append((name, body))
        return False

    monkeypatch.setattr(index, "_supa_rpc", claim)
    with pytest.raises(HTTPException) as rejected:
        index._claim_review_measurement(link, "user-a", "new-session")
    assert rejected.value.status_code == 409
    assert calls == [
        (
            "claim_retention_measurement",
            {
                "p_user_id": "user-a",
                "p_source_session_id": "source-session",
                "p_interval_days": 1,
                "p_session_id": "new-session",
            },
        )
    ]

    monkeypatch.setattr(index, "_supa_rpc", lambda _name, _body: True)
    assert index._claim_review_measurement(link, "user-a", "new-session") is None
