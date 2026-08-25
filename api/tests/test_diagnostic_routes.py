"""Identity, first-baseline and interruption recovery tests for diagnostics."""

from __future__ import annotations

from copy import deepcopy

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api.diagnostic_routes import register_diagnostic_routes

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"
REQUEST_A = "d7b986cb-4e75-4b2a-9b7f-a98a72dbdb49"
REQUEST_B = "a3f633fd-42f5-4f57-9d94-fd2eef518e78"


def _material():
    return {
        "id": "senet-cvpr-2018",
        "title": "Squeeze-and-Excitation Networks",
        "questions": [
            {"id": "q1", "prompt": "正式题一", "answer_guide": "hidden"},
            {"id": "q2", "prompt": "正式题二", "answer_guide": "hidden"},
            {"id": "q3", "prompt": "正式题三", "answer_guide": "hidden"},
        ],
    }


def _build_client(state=None):
    state = state or {
        "material": _material(),
        "tasks": {},
        "current_user": USER_A,
        "rpc_calls": [],
        "fail_complete_once": False,
    }

    def auth_user(authorization, *, required):
        if not authorization:
            if required:
                raise HTTPException(401, "login required")
            return None
        return state["current_user"]

    def supa_get(path):
        return [
            deepcopy(task)
            for task in state["tasks"].values()
            if f"id=eq.{task['id']}" in path and f"user_id=eq.{task['user_id']}" in path
        ]

    def supa_rpc(name, body):
        state["rpc_calls"].append((name, deepcopy(body)))
        if name == "prepare_diagnostic_attempt":
            existing = next(
                (
                    task
                    for task in state["tasks"].values()
                    if task["user_id"] == body["p_user_id"]
                    and task["material_id"] == body["p_material_id"]
                    and task["material_revision"] == body["p_material_revision"]
                    and task["diagnostic_version"] == body["p_diagnostic_version"]
                ),
                None,
            )
            if existing is None:
                existing = {
                    "id": body["p_id"],
                    "user_id": body["p_user_id"],
                    "client_request_id": body["p_client_request_id"],
                    "material_id": body["p_material_id"],
                    "material_title": body["p_material_title"],
                    "material_revision": body["p_material_revision"],
                    "diagnostic_version": body["p_diagnostic_version"],
                    "question_contract": deepcopy(body["p_question_contract"]),
                    "submission_json": None,
                    "status": "ready",
                    "result_json": None,
                }
                state["tasks"][existing["id"]] = existing
            return [deepcopy(existing)]
        task = state["tasks"].get(body["p_id"])
        if task is None or task["user_id"] != body["p_user_id"]:
            return []
        if name == "claim_diagnostic_attempt":
            submission = body["p_submission_json"]
            if task["status"] == "ready":
                task["status"] = "evaluating"
                task["submission_json"] = deepcopy(submission)
                return [{"claimed": True, "task_status": "evaluating", "stored_result": None}]
            same = task["status"] == "evaluating" and task["submission_json"] == submission
            return [{"claimed": same, "task_status": task["status"], "stored_result": task["result_json"]}]
        if name == "complete_diagnostic_attempt":
            if state["fail_complete_once"]:
                state["fail_complete_once"] = False
                raise RuntimeError("simulated process interruption")
            if task["status"] == "evaluating":
                task["status"] = "completed"
                task["result_json"] = deepcopy(body["p_result_json"])
            return [deepcopy(task)]
        raise AssertionError(name)

    app = FastAPI()
    register_diagnostic_routes(
        app,
        supa_ok=lambda: True,
        supa_get=supa_get,
        supa_rpc=supa_rpc,
        auth_user=auth_user,
        get_material_for_user=lambda material_id, _user_id: state["material"] if material_id == "senet-cvpr-2018" else None,
    )
    return TestClient(app), state


def _prepare(client, request_id=REQUEST_A, **changes):
    payload = {"material_id": "senet-cvpr-2018", "expected_user_id": USER_A, "client_request_id": request_id, **changes}
    return client.post("/api/diagnostics/prepare", headers={"Authorization": "Bearer token"}, json=payload)


def _answers(confidence="medium"):
    return [
        {"question_id": "p1", "response": "当前输入动态计算权重，通道仍保留；Scale逐通道乘到特征图，保持64通道。", "confidence": confidence},
        {"question_id": "p2", "response": "1×1×64 → 4 → 64 → 14×14×64", "confidence": confidence},
        {"question_id": "p3", "response": "transform之后经SE且在相加之前，identity不经过SE。", "confidence": confidence},
    ]


def _evaluate(client, task_id, answers=None):
    return client.post(
        f"/api/diagnostics/{task_id}/evaluate",
        headers={"Authorization": "Bearer token"},
        json={"expected_user_id": USER_A, "answers": answers or _answers()},
    )


def test_login_owner_and_uploaded_material_boundaries():
    client, state = _build_client()
    anonymous = client.post("/api/diagnostics/prepare", json={"material_id": "senet-cvpr-2018", "expected_user_id": USER_A, "client_request_id": REQUEST_A})
    assert anonymous.status_code == 401
    assert _prepare(client, expected_user_id=USER_B).status_code == 409
    assert _prepare(client, material_id="upload").status_code == 422
    assert state["tasks"] == {}


def test_different_client_requests_return_same_first_baseline_and_do_not_reset_completion():
    client, state = _build_client()
    first = _prepare(client)
    second = _prepare(client, REQUEST_B)
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    task_id = first.json()["id"]
    assert _evaluate(client, task_id).status_code == 200
    completed = _prepare(client, REQUEST_B)
    assert completed.json()["status"] == "completed"
    assert state["tasks"][task_id]["client_request_id"] == REQUEST_A


def test_prepare_and_completed_dto_never_leak_private_contract_or_scores():
    client, _state = _build_client()
    prepared = _prepare(client)
    assert [row["id"] for row in prepared.json()["questions"]] == ["p1", "p2", "p3"]
    assert all(set(row) == {"id", "kind", "prompt"} for row in prepared.json()["questions"])
    completed = _evaluate(client, prepared.json()["id"])
    serialized = completed.text.lower()
    for key in ("evidence_points", "forbidden_inference", "rubric_fingerprint", "score", "max_score", "checks", "source"):
        assert key not in serialized
    result = completed.json()["result"]
    assert result["route_type"] == "quick_review"
    assert result["recommended_section_id"] == result["recommended_path"][0]


def test_owner_only_get_survives_new_app_instance():
    first, state = _build_client()
    task_id = _prepare(first).json()["id"]
    second, _ = _build_client(state)
    assert second.get(f"/api/diagnostics/{task_id}", headers={"Authorization": "Bearer token"}).status_code == 200
    state["current_user"] = USER_B
    assert second.get(f"/api/diagnostics/{task_id}", headers={"Authorization": "Bearer token"}).status_code == 404


def test_duplicate_ids_and_invalid_confidence_fail_before_claim():
    client, state = _build_client()
    task_id = _prepare(client).json()["id"]
    duplicate = [{"question_id": "p1", "response": "answer", "confidence": "low"}] * 3
    assert _evaluate(client, task_id, duplicate).status_code == 422
    invalid = _answers()
    invalid[0]["confidence"] = "certain"
    assert _evaluate(client, task_id, invalid).status_code == 422
    missing = _answers()
    missing[0].pop("confidence")
    assert _evaluate(client, task_id, missing).status_code == 422

    assert state["tasks"][task_id]["status"] == "ready"


def test_revision_and_version_changes_fail_closed_before_claim():
    client, state = _build_client()
    task_id = _prepare(client).json()["id"]
    state["material"]["questions"][0]["prompt"] = "changed"
    assert _evaluate(client, task_id).status_code == 409
    state["material"] = _material()
    state["tasks"][task_id]["diagnostic_version"] = 999
    assert _evaluate(client, task_id).status_code == 409


def test_claim_interruption_can_resume_only_identical_submission():
    client, state = _build_client()
    task_id = _prepare(client).json()["id"]
    state["fail_complete_once"] = True
    assert _evaluate(client, task_id).status_code == 503
    assert state["tasks"][task_id]["status"] == "evaluating"
    recovered = _evaluate(client, task_id)
    assert recovered.status_code == 200
    assert recovered.json()["status"] == "completed"


def test_different_submission_cannot_overwrite_claimed_first_baseline():
    client, state = _build_client()
    task_id = _prepare(client).json()["id"]
    state["fail_complete_once"] = True
    assert _evaluate(client, task_id).status_code == 503
    changed = _answers()
    changed[0]["response"] = "这是永久剪枝"
    rejected = _evaluate(client, task_id, changed)
    assert rejected.status_code == 409
    assert state["tasks"][task_id]["submission_json"]["answers"] == _answers()
