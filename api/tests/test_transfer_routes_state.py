"""State-machine tests for paid misconception-transfer evaluation."""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import api.transfer_routes as routes
from api.transfer_core import material_rubric_fingerprint

USER_ID = "11111111-1111-4111-8111-111111111111"
SOURCE_ID = "source_session_1"


class _Response:
    def __init__(self, value=None):
        self._raw = json.dumps(value).encode() if value is not None else b""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._raw


def _material():
    return {
        "id": "uploaded-material",
        "title": "上传材料",
        "questions": [
            {
                "id": "q1",
                "kind": "concept",
                "prompt": "解释一个核心概念",
                "answer_guide": "必须说明原理与边界",
                "max_score": 4,
                "source": {"label": "上传文件", "detail": "第 1 段"},
            }
        ],
    }


def _source(material):
    return {
        "session_id": SOURCE_ID,
        "user_id": USER_ID,
        "material_id": material["id"],
        "material_title": material["title"],
        "misconception_tags": ["遗漏关键步骤"],
        "server_verified_at": "2026-08-25T00:00:00+00:00",
        "session_data": {
            "rubric_fingerprint": material_rubric_fingerprint(material),
            "result": {
                "question_results": [
                    {
                        "question_id": "q1",
                        "score": 1,
                        "max_score": 4,
                        "misconception_tags": ["遗漏关键步骤"],
                    }
                ]
            },
        },
    }


def _build_client(monkeypatch, *, quota_error=None, chunks_error=None):
    material = _material()
    source = _source(material)
    state = {
        "task": None,
        "provider_calls": 0,
        "ready_patches": 0,
        "archive_records": {},
        "archive_writes": 0,
    }

    def fake_urlopen(request, timeout=10):
        del timeout
        method = request.get_method()
        if method == "POST" and "transfer_tasks?on_conflict=id" in request.full_url:
            body = json.loads(request.data.decode())
            if state["task"] is None:
                state["task"] = dict(body)
            return _Response()
        if method == "PATCH" and "/transfer_tasks?" in request.full_url:
            body = json.loads(request.data.decode())
            if body.get("status") == "ready":
                state["ready_patches"] += 1
            state["task"].update(body)
            return _Response([state["task"]])
        raise AssertionError((method, request.full_url))

    monkeypatch.setattr(routes._urllib, "urlopen", fake_urlopen)

    def supa_get(path):
        if path.startswith("study_records?select=session_id,user_id"):
            return [source]
        if path.startswith("transfer_tasks?select=*"):
            return [state["task"]] if state["task"] else []
        if path.startswith("study_records?select=session_id"):
            task = state["task"] or {}
            return (
                [{"session_id": task.get("id")}] if task.get("id") in state["archive_records"] else []
            )
        raise AssertionError(path)

    def supa_rpc(_name, _body):
        task = state["task"]
        if task["status"] == "ready":
            task["status"] = "evaluating"
            return [{"claimed": True, "task_status": "evaluating", "stored_result": None}]
        return [
            {
                "claimed": False,
                "task_status": task["status"],
                "stored_result": task.get("result_json"),
            }
        ]

    def require_quota(_user_id, _action):
        if quota_error is not None:
            raise quota_error

    def get_chunks(_material_id, _user_id):
        if chunks_error is not None:
            raise chunks_error
        return [{"text": "可信原文片段"}]

    def up_study_record(record):
        state["archive_writes"] += 1
        state["archive_records"][record["session_id"]] = record

    app = FastAPI()
    routes.register_transfer_routes(
        app,
        supa_url="https://example.supabase.co",
        service_headers=lambda: {"Authorization": "Bearer service"},
        supa_ok=lambda: True,
        supa_get=supa_get,
        supa_rpc=supa_rpc,
        auth_user=lambda _authorization, required: USER_ID if required else None,
        get_material_for_user=lambda _material_id, _user_id: material,
        get_chunks=get_chunks,
        require_ai_quota=require_quota,
        up_study_record=up_study_record,
        sign_archive_retry=lambda _record: "signed-recovery-token",
    )
    return TestClient(app), state


def _prepare(client):
    response = client.post(
        "/api/transfer-tasks/prepare",
        headers={"Authorization": "Bearer access"},
        json={"source_session_id": SOURCE_ID, "expected_user_id": USER_ID},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _evaluate(client, task_id):
    return client.post(
        f"/api/transfer-tasks/{task_id}/evaluate",
        headers={"Authorization": "Bearer access"},
        json={
            "source_session_id": SOURCE_ID,
            "expected_user_id": USER_ID,
            "answer": "这是至少二十个汉字的迁移解释，用来覆盖一个新的具体情境与边界。",
        },
    )


def test_provider_timeout_freezes_task_without_second_paid_call(monkeypatch):
    client, state = _build_client(monkeypatch)

    async def timeout_provider(*_args, **_kwargs):
        state["provider_calls"] += 1
        raise TimeoutError("provider result unknown")

    monkeypatch.setattr(routes, "_evaluate_transfer_with_deepseek", timeout_provider)
    task_id = _prepare(client)
    first = _evaluate(client, task_id)
    assert first.status_code == 503
    assert state["task"]["status"] == "evaluating"
    assert state["ready_patches"] == 0

    second = _evaluate(client, task_id)
    assert second.status_code == 409
    assert state["provider_calls"] == 1


def test_quota_rejection_releases_before_provider(monkeypatch):
    client, state = _build_client(
        monkeypatch, quota_error=HTTPException(429, "quota exhausted")
    )

    async def provider(*_args, **_kwargs):
        state["provider_calls"] += 1
        raise AssertionError("provider must not be called")

    monkeypatch.setattr(routes, "_evaluate_transfer_with_deepseek", provider)
    task_id = _prepare(client)
    response = _evaluate(client, task_id)
    assert response.status_code == 429
    assert state["task"]["status"] == "ready"
    assert state["ready_patches"] == 1
    assert state["provider_calls"] == 0


def test_chunk_failure_releases_before_provider(monkeypatch):
    client, state = _build_client(monkeypatch, chunks_error=RuntimeError("chunk failure"))

    async def provider(*_args, **_kwargs):
        state["provider_calls"] += 1
        raise AssertionError("provider must not be called")

    monkeypatch.setattr(routes, "_evaluate_transfer_with_deepseek", provider)
    task_id = _prepare(client)
    response = _evaluate(client, task_id)
    assert response.status_code == 503
    assert state["task"]["status"] == "ready"
    assert state["ready_patches"] == 1
    assert state["provider_calls"] == 0


def test_prepare_binds_expected_user_and_does_not_create_task(monkeypatch):
    client, state = _build_client(monkeypatch)
    response = client.post(
        "/api/transfer-tasks/prepare",
        headers={"Authorization": "Bearer access"},
        json={
            "source_session_id": SOURCE_ID,
            "expected_user_id": "22222222-2222-4222-8222-222222222222",
        },
    )
    assert response.status_code == 409
    assert state["task"] is None


def test_prepare_never_exposes_owner_or_private_rubric(monkeypatch):
    client, _state = _build_client(monkeypatch)
    response = client.post(
        "/api/transfer-tasks/prepare",
        headers={"Authorization": "Bearer access"},
        json={"source_session_id": SOURCE_ID, "expected_user_id": USER_ID},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["id"].startswith("tr_")
    assert payload["status"] == "ready"
    assert "user_id" not in payload
    assert "private_rubric" not in payload
    assert "_rubric" not in payload
    assert "evidence" not in payload
    assert "_evidence" not in payload


def test_evaluate_rejects_task_id_not_derived_from_source(monkeypatch):
    client, state = _build_client(monkeypatch)
    _prepare(client)
    wrong_task_id = "tr_" + "0" * 32
    response = _evaluate(client, wrong_task_id)
    assert response.status_code == 422
    assert state["task"]["status"] == "ready"
    assert state["provider_calls"] == 0


def test_success_persists_trusted_archive_and_repeats_without_provider(monkeypatch):
    client, state = _build_client(monkeypatch)

    async def provider(*_args, **_kwargs):
        state["provider_calls"] += 1
        return {
            "score": 3,
            "max_score": 4,
            "verdict": "transferred",
            "feedback": "已把原理映射到新情境。",
            "evidence": [{"label": "上传文件", "detail": "第 1 段"}],
            "next_step": "等待后续保持检验。",
            "evaluator": "ai",
        }

    monkeypatch.setattr(routes, "_evaluate_transfer_with_deepseek", provider)
    task_id = _prepare(client)
    first = _evaluate(client, task_id)
    assert first.status_code == 200, first.text
    assert first.json()["cloud_saved"] is True
    assert first.json()["verdict"] == "transferred"
    assert state["task"]["status"] == "completed"
    assert state["archive_writes"] == 1
    record = state["archive_records"][task_id]
    assert record["server_verified_at"]
    assert record["session_data"]["transfer"]["source_session_id"] == SOURCE_ID

    second = _evaluate(client, task_id)
    assert second.status_code == 200, second.text
    assert second.json()["session_id"] == task_id
    assert state["provider_calls"] == 1
    assert state["archive_writes"] == 1
