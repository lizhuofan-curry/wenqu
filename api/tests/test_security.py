from __future__ import annotations

import json
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api import index

AUTH_A = {"Authorization": "Bearer token-a"}
AUTH_B = {"Authorization": "Bearer token-b"}


@pytest.fixture()
def api_client(monkeypatch):
    original_materials = index.store._materials
    original_sessions = index.store._sessions
    original_chunks = index.store._chunks

    index.store._materials = {"senet-cvpr-2018": deepcopy(index.SENET_MATERIAL)}
    index.store._sessions = {}
    index.store._chunks = {}
    monkeypatch.setattr(
        index,
        "_verify_access_token",
        lambda token: {"token-a": "user-a", "token-b": "user-b"}.get(token),
    )
    monkeypatch.setattr(index, "_supa_ok", lambda: False)
    monkeypatch.setattr(index, "_consume_ai_quota", lambda _user_id, _action: True)
    monkeypatch.setattr(index, "_supa_rpc", lambda _name, _body: True)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    try:
        yield TestClient(index.app)
    finally:
        index.store._materials = original_materials
        index.store._sessions = original_sessions
        index.store._chunks = original_chunks


def _private_material(material_id: str = "upload-private-a", owner: str = "user-a") -> dict:
    return {
        "id": material_id,
        "title": "用户 A 的私有材料",
        "subtitle": "仅用于安全回归测试",
        "source_type": "markdown",
        "estimated_minutes": 10,
        "difficulty": "测试",
        "progress": 0,
        "created_at": "2026-08-24T00:00:00+00:00",
        "map": [],
        "learning_goals": ["验证所有权隔离"],
        "sections": [
            {
                "id": "s1",
                "title": "私有正文",
                "strict_track": "这是一段足够长的私有原文，用于测试学习会话和 AI 评分所有权隔离。",
                "companion_track": "私有陪读内容",
            }
        ],
        "questions": [
            {
                "id": "q1",
                "kind": "concept",
                "prompt": "问题一",
                "hint": "提示一",
                "answer_guide": "答案一",
                "max_score": 4,
            },
            {
                "id": "q2",
                "kind": "method",
                "prompt": "问题二",
                "hint": "提示二",
                "answer_guide": "答案二",
                "max_score": 4,
            },
            {
                "id": "q3",
                "kind": "evidence",
                "prompt": "问题三",
                "hint": "提示三",
                "answer_guide": "答案三",
                "max_score": 3,
            },
        ],
        "generation": {"status": "ready", "message": "测试材料"},
        "_hash": "private-hash",
        "_owner_id": owner,
    }


def _answers(ids=("q1", "q2", "q3")) -> list[dict[str, str]]:
    return [
        {"question_id": question_id, "response": f"对 {question_id} 的测试回答"}
        for question_id in ids
    ]


def _evaluation_payload(material_id: str, ids=("q1", "q2", "q3")) -> dict:
    return {
        "answers": _answers(ids),
        "retelling": "这是一段足够长的复述，用来验证评分与权限边界。",
        "material_id": material_id,
        "persona_id": "huangfeng",
    }

def _trusted_review_source(*, days_ago: float = 1.5, session_data: dict | None = None):
    completed_at = datetime.now(UTC) - timedelta(days=days_ago)
    return {
        "session_id": "source-session",
        "material_id": "senet-cvpr-2018",
        "completed_at": completed_at.isoformat(),
        "server_verified_at": completed_at.isoformat(),
        "session_data": session_data
        if session_data is not None
        else {
            "rubric_fingerprint": index.material_rubric_fingerprint(
                index.SENET_MATERIAL
            ),
            "result": {"question_results": []},
        },
    }


def _review_lookup(source: dict, prior: list[dict] | None = None):
    def lookup(path: str):
        if "session_data->review->>source_session_id" in path:
            return prior or []
        return [source]

    return lookup



def _assert_private_keys_absent(value) -> None:
    if isinstance(value, dict):
        assert not ({"answer_guide", "max_score", "_hash", "_owner_id"} & value.keys())
        for child in value.values():
            _assert_private_keys_absent(child)
    elif isinstance(value, list):
        for child in value:
            _assert_private_keys_absent(child)


def test_health_response_has_security_headers(api_client):
    response = api_client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["version"] == "v.5"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    )


def test_health_does_not_expose_runtime_configuration(api_client):
    response = api_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "v.5"}


def test_anonymous_only_sees_builtin_and_private_routes_require_auth(api_client):
    private = _private_material()
    index.store.seed_senet(private)
    owner_session = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": private["id"], "persona_id": "huangfeng"},
    )
    assert owner_session.status_code == 201, owner_session.text

    anonymous_list = api_client.get("/api/materials")
    assert anonymous_list.status_code == 200
    assert [row["id"] for row in anonymous_list.json()] == ["senet-cvpr-2018"]

    requests = [
        api_client.get(f"/api/materials/{private['id']}"),
        api_client.post(
            "/api/materials/upload",
            files={"file": ("notes.md", b"# private notes", "text/markdown")},
        ),
        api_client.delete(f"/api/materials/{private['id']}"),
        api_client.post(f"/api/materials/{private['id']}/regenerate"),
        api_client.post(
            "/api/sessions",
            json={"material_id": private["id"], "persona_id": "huangfeng"},
        ),
        api_client.post(
            f"/api/sessions/{owner_session.json()['id']}/evaluate",
            json=_evaluation_payload(private["id"]),
        ),
    ]
    assert [response.status_code for response in requests] == [401] * len(requests)


def test_builtin_flow_is_public_and_anonymous_evaluation_never_calls_ai(
    api_client, monkeypatch
):
    async def must_not_call_ai(*_args, **_kwargs):
        raise AssertionError("anonymous built-in scoring must not call an AI provider")

    monkeypatch.setenv("DEEPSEEK_API_KEY", "configured-but-forbidden-for-anonymous")
    monkeypatch.setattr(index, "evaluate_with_deepseek", must_not_call_ai)

    listed = api_client.get("/api/materials")
    detail = api_client.get("/api/materials/senet-cvpr-2018")
    started = api_client.post(
        "/api/sessions",
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )

    assert listed.status_code == 200
    assert detail.status_code == 200
    assert started.status_code == 201, started.text
    completed = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        json=_evaluation_payload("senet-cvpr-2018"),
    )
    assert completed.status_code == 200, completed.text
    result = completed.json()["result"]
    assert result["evaluator"] == "rules"
    assert all(isinstance(row["source"], dict) for row in result["question_results"])
    assert all(row["source"]["label"].startswith("PDF 第") for row in result["question_results"])


def test_user_b_cannot_enumerate_or_mutate_user_a_material(api_client):
    private = _private_material()
    index.store.seed_senet(private)
    owner_session = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": private["id"], "persona_id": "huangfeng"},
    )
    assert owner_session.status_code == 201, owner_session.text

    owner_list = api_client.get("/api/materials", headers=AUTH_A)
    other_list = api_client.get("/api/materials", headers=AUTH_B)
    assert private["id"] in {row["id"] for row in owner_list.json()}
    assert private["id"] not in {row["id"] for row in other_list.json()}

    forbidden_as_not_found = [
        api_client.get(f"/api/materials/{private['id']}", headers=AUTH_B),
        api_client.delete(f"/api/materials/{private['id']}", headers=AUTH_B),
        api_client.post(f"/api/materials/{private['id']}/regenerate", headers=AUTH_B),
        api_client.post(
            "/api/sessions",
            headers=AUTH_B,
            json={"material_id": private["id"], "persona_id": "huangfeng"},
        ),
        api_client.post(
            f"/api/sessions/{owner_session.json()['id']}/evaluate",
            headers=AUTH_B,
            json=_evaluation_payload(private["id"]),
        ),
    ]
    assert [response.status_code for response in forbidden_as_not_found] == [404] * 5
    assert index.store.get_material(private["id"], "user-a") is not None


def test_public_material_dto_never_exposes_internal_answers_or_owner(api_client):
    private = _private_material()
    index.store.seed_senet(private)

    builtin = api_client.get("/api/materials/senet-cvpr-2018")
    uploaded = api_client.get(f"/api/materials/{private['id']}", headers=AUTH_A)

    assert builtin.status_code == 200
    assert uploaded.status_code == 200
    _assert_private_keys_absent(builtin.json())
    _assert_private_keys_absent(uploaded.json())


def test_upload_rejects_unsupported_extension_and_disguised_pdf(api_client):
    bad_extension = api_client.post(
        "/api/materials/upload",
        headers=AUTH_A,
        files={"file": ("payload.txt", b"plain text", "text/plain")},
    )
    fake_pdf = api_client.post(
        "/api/materials/upload",
        headers=AUTH_A,
        files={"file": ("paper.pdf", b"not really a pdf", "application/pdf")},
    )

    assert bad_extension.status_code == 400, bad_extension.text
    assert fake_pdf.status_code == 400, fake_pdf.text


def test_quota_denial_returns_429_before_ai_call(api_client, monkeypatch):
    private = _private_material()
    index.store.seed_senet(private)
    monkeypatch.setattr(index, "_consume_ai_quota", lambda _user_id, _action: False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only")

    async def must_not_call_ai(*_args, **_kwargs):
        raise AssertionError("AI must not run after quota denial")

    monkeypatch.setattr(index, "evaluate_with_deepseek", must_not_call_ai)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": private["id"], "persona_id": "huangfeng"},
    )
    denied = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=_evaluation_payload(private["id"]) | {"expected_user_id": "user-a"},
    )

    assert denied.status_code == 429, denied.text


@pytest.mark.parametrize(
    "ids",
    [
        ("q1", "q1", "q3"),
        ("q1", "q2", "unknown"),
        ("q1", "q2"),
    ],
)
def test_evaluation_requires_exactly_three_unique_material_question_ids(api_client, ids):
    started = api_client.post(
        "/api/sessions",
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    response = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        json=_evaluation_payload("senet-cvpr-2018", ids),
    )

    assert response.status_code in {400, 422}, response.text


def test_ai_scores_are_bounded_by_server_owned_question_maxima(api_client, monkeypatch):
    private = _private_material()
    index.store.seed_senet(private)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-only")

    async def oversized_ai_result(*_args, **_kwargs):
        return {
            "mastery": 999,
            "headline": "provider supplied an impossible score",
            "question_results": [
                {
                    "question_id": question_id,
                    "score": 999,
                    "max_score": 999,
                    "verdict": "掌握",
                    "feedback": "test",
                    "misconception_tags": [],
                }
                for question_id in ("q1", "q2", "q3")
            ],
            "retelling": {"score": 999, "max_score": 999, "verdict": "掌握"},
            "misconception_tags": [],
        }

    monkeypatch.setattr(index, "evaluate_with_deepseek", oversized_ai_result)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": private["id"], "persona_id": "huangfeng"},
    )
    completed = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=_evaluation_payload(private["id"]) | {"expected_user_id": "user-a"},
    )

    assert completed.status_code == 200, completed.text
    result = completed.json()["result"]
    assert 0 <= result["mastery"] <= 100
    assert [row["max_score"] for row in result["question_results"]] == [4, 4, 3]
    assert all(0 <= row["score"] <= row["max_score"] for row in result["question_results"])
    assert result["retelling"]["score"] <= result["retelling"]["max_score"] == 5


def test_debug_route_is_not_exposed(api_client):
    assert api_client.get("/api/debug").status_code == 404


def test_material_persistence_failures_do_not_report_false_success(
    api_client, monkeypatch
):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)

    def fail_persistence(*_args, **_kwargs):
        raise OSError("simulated persistence outage")

    monkeypatch.setattr(index, "_supa_up", fail_persistence)
    before_ids = set(index.store._materials)
    uploaded = api_client.post(
        "/api/materials/upload",
        headers=AUTH_A,
        files={
            "file": (
                "safe.md",
                "# 可验证材料\n\n这是一段用于验证持久化失败回滚的正文。".encode(),
                "text/markdown",
            )
        },
    )
    assert uploaded.status_code == 503, uploaded.text
    assert set(index.store._materials) == before_ids

    private = _private_material()
    index.store.seed_senet(private)
    monkeypatch.setattr(index, "_supa_del", fail_persistence)
    deleted = api_client.delete(f"/api/materials/{private['id']}", headers=AUTH_A)
    assert deleted.status_code == 503, deleted.text
    assert index.store.get_material(private["id"], "user-a") is not None


def test_authenticated_evaluation_persists_only_server_scoring(
    api_client, monkeypatch
):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    monkeypatch.setattr(
        index,
        "_supa_get",
        _review_lookup(_trusted_review_source()),
    )
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    assert started.status_code == 201, started.text
    payload = _evaluation_payload("senet-cvpr-2018")
    payload.update(
        {
            "expected_user_id": "user-a",
            "review_source_session_id": "source-session",
            "review_interval_days": 1,
            "mastery": 100,
            "headline": "客户端伪造标题",
            "session_data": {"result": {"mastery": 100}},
        }
    )

    evaluated = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )

    assert evaluated.status_code == 200, evaluated.text
    assert evaluated.json()["cloud_saved"] is True
    assert len(writes) == 1
    record = writes[0]
    assert record["user_id"] == "user-a"
    assert record["mastery"] == evaluated.json()["result"]["mastery"]
    assert record["headline"] == evaluated.json()["result"]["headline"]
    assert record["headline"] != "客户端伪造标题"
    review = record["session_data"]["review"]
    assert review["source_session_id"] == "source-session"
    assert review["interval_days"] == 1
    assert review["measurement_version"] == 1
    assert review["timing_status"] == "on_time"
    assert review["actual_delay_seconds"] >= int(1.5 * 86_400)
    assert review["source_rubric_fingerprint"]
    assert review["review_completed_at"] == record["completed_at"]
    assert review["prior_completed_intervals"] == []


def test_evaluation_does_not_persist_after_account_switch(api_client, monkeypatch):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_B,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    payload = _evaluation_payload("senet-cvpr-2018")
    payload["expected_user_id"] = "user-a"

    evaluated = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_B,
        json=payload,
    )

    assert evaluated.status_code == 409
    assert writes == []


def test_authenticated_evaluation_requires_expected_user_id(api_client, monkeypatch):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    payload = _evaluation_payload("senet-cvpr-2018")

    evaluated = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )

    assert evaluated.status_code == 409
    assert writes == []
    assert index.store._sessions[started.json()["id"]]["status"] == "active"


def test_archive_write_failure_returns_recoverable_completed_result(
    api_client, monkeypatch
):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)

    def fail_write(_record):
        raise OSError("simulated archive outage")

    monkeypatch.setattr(index, "_supa_up_study_record", fail_write)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    payload = _evaluation_payload("senet-cvpr-2018")
    payload["expected_user_id"] = "user-a"

    evaluated = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )

    assert evaluated.status_code == 200, evaluated.text
    assert evaluated.json()["status"] == "completed"
    assert evaluated.json()["result"]
    assert evaluated.json()["cloud_saved"] is False


def test_review_source_failure_happens_before_scoring_and_can_retry(
    api_client, monkeypatch
):
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    monkeypatch.setattr(index, "_supa_get", lambda _path: (_ for _ in ()).throw(OSError("outage")))
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    payload = _evaluation_payload("senet-cvpr-2018")
    payload.update(
        {
            "expected_user_id": "user-a",
            "review_source_session_id": "source-session",
            "review_interval_days": 1,
        }
    )

    failed = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )
    assert failed.status_code == 502
    assert index.store._sessions[started.json()["id"]]["status"] == "active"
    assert writes == []

    monkeypatch.setattr(
        index,
        "_supa_get",
        _review_lookup(_trusted_review_source()),
    )
    retried = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )
    assert retried.status_code == 200, retried.text
    assert retried.json()["cloud_saved"] is True
    assert len(writes) == 1


def _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch):
    monkeypatch.setattr(index, "_archive_retry_secret", "test-retry-secret-at-least-32-bytes")
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    monkeypatch.setattr(
        index,
        "_supa_up_study_record",
        lambda _record: (_ for _ in ()).throw(OSError("simulated archive outage")),
    )
    started = api_client.post(
        "/api/sessions",
        headers=AUTH_A,
        json={"material_id": "senet-cvpr-2018", "persona_id": "huangfeng"},
    )
    payload = _evaluation_payload("senet-cvpr-2018")
    payload["expected_user_id"] = "user-a"
    evaluated = api_client.post(
        f"/api/sessions/{started.json()['id']}/evaluate",
        headers=AUTH_A,
        json=payload,
    )
    assert evaluated.status_code == 200, evaluated.text
    assert evaluated.json()["cloud_saved"] is False
    assert evaluated.json()["cloud_retry_token"]
    return evaluated.json()


def test_archive_retry_uses_signed_server_record_and_is_repeatable(
    api_client, monkeypatch
):
    completed = _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch)
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    request = {
        "retry_token": completed["cloud_retry_token"],
        "expected_user_id": "user-a",
        "mastery": 100,
        "headline": "客户端伪造标题",
    }

    first = api_client.post("/api/archive/retry", headers=AUTH_A, json=request)
    second = api_client.post("/api/archive/retry", headers=AUTH_A, json=request)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert len(writes) == 2
    assert writes[0] == writes[1]
    assert writes[0]["mastery"] == completed["result"]["mastery"]
    assert writes[0]["headline"] == completed["result"]["headline"]
    assert writes[0]["headline"] != "客户端伪造标题"


def test_archive_retry_rejects_tampering_and_other_accounts(api_client, monkeypatch):
    completed = _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch)
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    token = completed["cloud_retry_token"]

    tampered = api_client.post(
        "/api/archive/retry",
        headers=AUTH_A,
        json={"retry_token": token[:-1] + ("A" if token[-1] != "A" else "B"), "expected_user_id": "user-a"},
    )
    switched = api_client.post(
        "/api/archive/retry",
        headers=AUTH_B,
        json={"retry_token": token, "expected_user_id": "user-b"},
    )

    assert tampered.status_code == 422
    assert switched.status_code == 403
    assert writes == []


def test_archive_retry_failure_keeps_same_receipt_reusable(api_client, monkeypatch):
    completed = _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch)
    token = completed["cloud_retry_token"]
    request = {"retry_token": token, "expected_user_id": "user-a"}
    monkeypatch.setattr(
        index,
        "_supa_up_study_record",
        lambda _record: (_ for _ in ()).throw(OSError("still unavailable")),
    )

    failed = api_client.post("/api/archive/retry", headers=AUTH_A, json=request)
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    recovered = api_client.post("/api/archive/retry", headers=AUTH_A, json=request)

    assert failed.status_code == 503
    assert recovered.status_code == 200
    assert len(writes) == 1

def _resign_retry_token(token: str, issued_at: datetime) -> str:
    encoded, _signature = token.split(".", 1)
    payload = json.loads(index._base64url_decode(encoded).decode("utf-8"))
    payload["issued_at"] = issued_at.isoformat()
    rewritten = index._base64url_encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    key = index._archive_retry_key()
    assert key is not None
    signature = index._base64url_encode(
        index.hmac.new(key, rewritten.encode("ascii"), index.hashlib.sha256).digest()
    )
    return f"{rewritten}.{signature}"


@pytest.mark.parametrize("secret", ["", "too-short"])
def test_archive_retry_rejects_missing_or_short_secret(api_client, monkeypatch, secret):
    monkeypatch.setattr(index, "_archive_retry_secret", secret)
    monkeypatch.setattr(index, "_supa_ok", lambda: True)
    response = api_client.post(
        "/api/archive/retry",
        headers=AUTH_A,
        json={"retry_token": "x" * 20, "expected_user_id": "user-a"},
    )
    assert response.status_code == 503
    assert "32" in response.json()["detail"]


def test_archive_retry_rejects_future_receipt(api_client, monkeypatch):
    completed = _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch)
    future = _resign_retry_token(
        completed["cloud_retry_token"],
        datetime.now(UTC) + timedelta(minutes=6),
    )
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    response = api_client.post(
        "/api/archive/retry",
        headers=AUTH_A,
        json={"retry_token": future, "expected_user_id": "user-a"},
    )
    assert response.status_code == 422
    assert writes == []


def test_archive_retry_requires_auth_and_matching_expected_user(api_client, monkeypatch):
    completed = _evaluation_with_failed_archive_and_receipt(api_client, monkeypatch)
    token = completed["cloud_retry_token"]
    writes = []
    monkeypatch.setattr(index, "_supa_up_study_record", writes.append)
    no_auth = api_client.post(
        "/api/archive/retry",
        json={"retry_token": token, "expected_user_id": "user-a"},
    )
    expected_mismatch = api_client.post(
        "/api/archive/retry",
        headers=AUTH_A,
        json={"retry_token": token, "expected_user_id": "user-b"},
    )
    switched = api_client.post(
        "/api/archive/retry",
        headers=AUTH_B,
        json={"retry_token": token, "expected_user_id": "user-a"},
    )
    assert no_auth.status_code == 401
    assert expected_mismatch.status_code == 409
    assert switched.status_code == 409
    assert writes == []


def test_study_record_upsert_uses_ignore_duplicates(monkeypatch):
    captured = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, _exc_type, _exc, _traceback):
            return False

    def fake_urlopen(request, timeout):
        captured.append((request, timeout))
        return FakeResponse()

    monkeypatch.setattr(index, "_supa_url", "https://example.supabase.co")
    monkeypatch.setattr(index, "_supa_service_key", "service-key")
    monkeypatch.setattr(index._urllib, "urlopen", fake_urlopen)
    index._supa_up_study_record({"session_id": "session-a", "user_id": "user-a"})
    assert len(captured) == 1
    request, timeout = captured[0]
    assert request.get_method() == "POST"
    assert request.get_header("Prefer") == "resolution=ignore-duplicates"
    assert timeout == 10
