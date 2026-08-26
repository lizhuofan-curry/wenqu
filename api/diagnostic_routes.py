"""Authenticated, database-backed pre-study diagnostic routes."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from typing import Literal
from urllib import parse as _urlparse
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from api.diagnostic_core import (
    BUILTIN_MATERIAL_ID,
    DIAGNOSTIC_VERSION,
    build_question_contract,
    diagnostic_id,
    evaluate_diagnostic,
    normalize_answers,
    public_questions,
)
from api.transfer_core import material_rubric_fingerprint

logger = logging.getLogger(__name__)
_PUBLIC_STATUSES = {"ready", "developing", "needs_foundation", "evidence_insufficient"}
_PUBLIC_ROUTES = {"full", "focused", "quick_review"}


class DiagnosticPrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1, max_length=128)
    expected_user_id: str = Field(min_length=1, max_length=64)
    client_request_id: UUID


class DiagnosticAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str = Field(pattern=r"^p[123]$")
    response: str = Field(default="", max_length=4000)
    confidence: Literal["low", "medium", "high"]


class DiagnosticEvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_user_id: str = Field(min_length=1, max_length=64)
    answers: list[DiagnosticAnswer] = Field(min_length=3, max_length=3)


def _encoded(value: str) -> str:
    return _urlparse.quote(value, safe="")


def _validate_task_id(task_id: str) -> None:
    if not re.fullmatch(r"dg_[0-9a-f]{32}", task_id):
        raise HTTPException(422, "诊断任务编号无效。")


def _public_result(value: object) -> dict:
    if not isinstance(value, dict):
        raise HTTPException(503, "诊断评分状态不完整，请联系维护者处理。")
    raw_objectives = value.get("objective_results")
    path = value.get("recommended_path")
    route_type = value.get("route_type")
    if not isinstance(raw_objectives, list) or len(raw_objectives) != 3:
        raise HTTPException(503, "诊断评分状态不完整，请联系维护者处理。")
    if not isinstance(path, list) or not path or not all(item in {"squeeze", "excitation", "scale", "resnet"} for item in path):
        raise HTTPException(503, "诊断评分状态不完整，请联系维护者处理。")
    objectives = []
    for row in raw_objectives:
        if not isinstance(row, dict) or row.get("status") not in _PUBLIC_STATUSES:
            raise HTTPException(503, "诊断评分状态不完整，请联系维护者处理。")
        objectives.append(
            {
                "objective_id": str(row.get("objective_id") or "")[:80],
                "label": str(row.get("label") or "")[:160],
                "status": row["status"],
                "summary": str(row.get("summary") or "")[:500],
            }
        )
    if route_type not in _PUBLIC_ROUTES:
        raise HTTPException(503, "诊断评分状态不完整，请联系维护者处理。")
    return {
        "objective_results": objectives,
        "route_type": route_type,
        "route_reason": str(value.get("route_reason") or "")[:500],
        "recommended_path": path,
        "recommended_section_id": path[0],
        "summary": str(value.get("summary") or "")[:500],
    }


def _row_response(row: dict) -> dict:
    contract = row.get("question_contract")
    if not isinstance(contract, dict):
        raise HTTPException(503, "诊断题目状态不完整，请联系维护者处理。")
    response = {
        "id": str(row.get("id") or ""),
        "status": str(row.get("status") or "ready"),
        "material_id": str(row.get("material_id") or ""),
        "material_title": str(row.get("material_title") or ""),
        "material_revision": str(row.get("material_revision") or ""),
        "questions": public_questions(contract),
    }
    if response["status"] == "completed":
        response["result"] = _public_result(row.get("result_json"))
    return response


def register_diagnostic_routes(
    app: FastAPI,
    *,
    supa_ok: Callable[[], bool],
    supa_get: Callable[[str], object],
    supa_rpc: Callable[[str, dict], object],
    auth_user: Callable[..., str | None],
    get_material_for_user: Callable[[str, str | None], dict | None],
) -> None:
    def require_user(authorization: str | None, expected_user_id: str | None = None) -> str:
        user_id = auth_user(authorization, required=True)
        assert user_id is not None
        if expected_user_id is not None and expected_user_id != user_id:
            raise HTTPException(409, "登录账号状态不一致，未执行课前诊断。")
        return user_id

    def require_database() -> None:
        if not supa_ok():
            raise HTTPException(503, "云端课前诊断暂时不可用。")

    def get_owned_task(task_id: str, user_id: str) -> dict | None:
        try:
            rows = supa_get("diagnostic_attempts?select=*" f"&id=eq.{_encoded(task_id)}&user_id=eq.{_encoded(user_id)}&limit=1")
        except Exception as exc:
            logger.warning("diagnostic_lookup_failed error=%s", type(exc).__name__)
            raise HTTPException(503, "课前诊断暂时无法读取。") from exc
        return rows[0] if isinstance(rows, list) and rows else None

    @app.post("/api/diagnostics/prepare")
    def prepare_diagnostic(req: DiagnosticPrepareRequest, authorization: str | None = Header(default=None, alias="Authorization")):
        user_id = require_user(authorization, req.expected_user_id)
        if req.material_id != BUILTIN_MATERIAL_ID:
            raise HTTPException(422, "课前诊断首版仅支持内置 SENet 材料。")
        require_database()
        material = get_material_for_user(req.material_id, user_id)
        if material is None:
            raise HTTPException(404, "诊断材料不存在。")
        contract = build_question_contract(material)
        revision = contract["material_revision"]
        task_id = diagnostic_id(user_id, req.material_id, revision)
        title = str(material.get("title") or "")[:500]
        try:
            value = supa_rpc(
                "prepare_diagnostic_attempt",
                {
                    "p_id": task_id,
                    "p_user_id": user_id,
                    "p_client_request_id": str(req.client_request_id),
                    "p_material_id": req.material_id,
                    "p_material_title": title,
                    "p_material_revision": revision,
                    "p_diagnostic_version": DIAGNOSTIC_VERSION,
                    "p_question_contract": contract,
                },
            )
        except Exception as exc:
            logger.warning("diagnostic_prepare_failed error=%s", type(exc).__name__)
            raise HTTPException(503, "课前诊断暂时无法安全创建。") from exc
        rows = value if isinstance(value, list) else []
        row = rows[0] if rows and isinstance(rows[0], dict) else None
        if row is None:
            raise HTTPException(503, "课前诊断创建后未能读取。")
        if (
            row.get("id") != task_id
            or row.get("user_id") != user_id
            or row.get("material_id") != req.material_id
            or row.get("material_title") != title
            or row.get("material_revision") != revision
            or row.get("diagnostic_version") != DIAGNOSTIC_VERSION
            or row.get("question_contract") != contract
        ):
            raise HTTPException(409, "课前诊断基线与已有任务冲突。")
        return _row_response(row)

    @app.get("/api/diagnostics/{task_id}")
    def get_diagnostic(task_id: str, authorization: str | None = Header(default=None, alias="Authorization")):
        _validate_task_id(task_id)
        user_id = require_user(authorization)
        require_database()
        row = get_owned_task(task_id, user_id)
        if row is None:
            raise HTTPException(404, "课前诊断不存在。")
        return _row_response(row)

    @app.post("/api/diagnostics/{task_id}/evaluate")
    def evaluate_task(task_id: str, req: DiagnosticEvaluateRequest, authorization: str | None = Header(default=None, alias="Authorization")):
        _validate_task_id(task_id)
        user_id = require_user(authorization, req.expected_user_id)
        require_database()
        try:
            answers = normalize_answers([answer.model_dump() for answer in req.answers])
        except ValueError as exc:
            raise HTTPException(422, "必须各提交一次 p1、p2、p3，信心仅可为 low、medium 或 high。") from exc
        row = get_owned_task(task_id, user_id)
        if row is None:
            raise HTTPException(404, "课前诊断不存在。")
        if row.get("material_id") != BUILTIN_MATERIAL_ID or row.get("diagnostic_version") != DIAGNOSTIC_VERSION:
            raise HTTPException(409, "诊断版本已经变化，请重新开始。")
        material = get_material_for_user(BUILTIN_MATERIAL_ID, user_id)
        if material is None:
            raise HTTPException(404, "诊断材料不存在。")
        revision = material_rubric_fingerprint(material)
        if row.get("material_revision") != revision:
            raise HTTPException(409, "诊断材料或评分规则已经变化，请重新开始。")
        if row.get("status") == "completed":
            return _row_response(row)
        submission = {"answers": answers}
        try:
            claimed_value = supa_rpc(
                "claim_diagnostic_attempt",
                {"p_id": task_id, "p_user_id": user_id, "p_material_revision": revision, "p_submission_json": submission},
            )
        except Exception as exc:
            logger.warning("diagnostic_claim_failed error=%s", type(exc).__name__)
            raise HTTPException(503, "课前诊断暂时无法领取评分。") from exc
        claimed_rows = claimed_value if isinstance(claimed_value, list) else []
        claimed = claimed_rows[0] if claimed_rows and isinstance(claimed_rows[0], dict) else {}
        if not claimed.get("claimed"):
            if claimed.get("task_status") == "completed":
                latest = get_owned_task(task_id, user_id)
                if latest is not None:
                    return _row_response(latest)
            if claimed.get("task_status") == "evaluating":
                raise HTTPException(409, "首次课前基线已由另一份不同提交锁定，不能覆盖。")
            raise HTTPException(409, "课前诊断当前不能评分，请重新打开后再试。")
        contract = row.get("question_contract")
        if not isinstance(contract, dict):
            raise HTTPException(503, "诊断题目状态不完整，请联系维护者处理。")
        try:
            result = evaluate_diagnostic(contract, answers)
        except (TypeError, ValueError) as exc:
            raise HTTPException(409, "诊断题面或隐藏规则版本不一致，请重新开始。") from exc
        try:
            completed_value = supa_rpc(
                "complete_diagnostic_attempt",
                {"p_id": task_id, "p_user_id": user_id, "p_material_revision": revision, "p_result_json": result},
            )
        except Exception as exc:
            logger.warning("diagnostic_complete_failed error=%s", type(exc).__name__)
            raise HTTPException(503, "诊断结果暂时无法安全保存；相同答案可稍后重新提交恢复。") from exc
        completed_rows = completed_value if isinstance(completed_value, list) else []
        completed = completed_rows[0] if completed_rows and isinstance(completed_rows[0], dict) else None
        if completed is None or completed.get("status") != "completed":
            raise HTTPException(503, "诊断结果保存后未能确认。")
        return _row_response(completed)
