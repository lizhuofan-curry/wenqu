from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path

import pytest

from api.transfer_core import (
    build_transfer_task,
    evaluate_senet_transfer,
    material_rubric_fingerprint,
    public_transfer_task,
    transfer_verdict,
)


def _question(
    question_id: str,
    kind: str,
    prompt: str,
    answer_guide: str,
) -> dict:
    return {
        "id": question_id,
        "kind": kind,
        "prompt": prompt,
        "hint": "只提示方向，不提供答案。",
        "source": {
            "label": f"PDF 第 {question_id[-1]} 页",
            "detail": f"原文定位 {question_id}",
        },
        "answer_guide": answer_guide,
        "max_score": 4,
    }


def _senet_material() -> dict:
    return {
        "id": "senet-cvpr-2018",
        "title": "Squeeze-and-Excitation Networks",
        "questions": [
            _question("q1", "concept", "Squeeze 保留和丢失了什么？", "q1 私有评分依据"),
            _question("q2", "tensor", "写出各阶段形状。", "q2 私有评分依据"),
            _question("q3", "structure", "SE 位于哪一条分支？", "q3 私有评分依据"),
        ],
    }


def _source_record(
    question_id: str,
    label: str,
    *,
    score: int = 0,
    maximum: int = 4,
    rubric_fingerprint: str | None = None,
) -> dict:
    session_data: dict = {
        "result": {
            "question_results": [
                {
                    "question_id": question_id,
                    "score": score,
                    "max_score": maximum,
                    "misconception_tags": [label],
                }
            ]
        }
    }
    if rubric_fingerprint is not None:
        session_data["rubric_fingerprint"] = rubric_fingerprint
    return {
        "session_id": "source-session-1",
        "server_verified_at": "2026-08-25T00:00:00+00:00",
        "material_id": "senet-cvpr-2018",
        "misconception_tags": [label],
        "session_data": session_data,
    }


def test_transfer_task_is_deterministic_and_bound_to_user_source_and_revision():
    material = _senet_material()
    source = _source_record("q2", "未写出瓶颈维度")

    first = build_transfer_task("user-a", deepcopy(source), deepcopy(material))
    second = build_transfer_task("user-a", deepcopy(source), deepcopy(material))
    other_user = build_transfer_task("user-b", deepcopy(source), deepcopy(material))

    assert first == second
    assert first["id"] != other_user["id"]
    assert re.fullmatch(r"tr_[0-9a-f]{32}", first["id"])
    assert first["source_question_id"] == "q2"
    assert first["target"] == {
        "code": "bottleneck_dimension",
        "label": "未写出瓶颈维度",
    }
    assert first["material_revision"] == material_rubric_fingerprint(material)


def test_public_transfer_task_never_exposes_private_rubric_or_evidence_payload():
    material = {
        "id": "upload-private-a",
        "title": "私有上传材料",
        "questions": [
            _question(
                "q1",
                "concept",
                "把这个原理迁移到新的情境。",
                "TOP-SECRET-RUBRIC：必须包含不可公开的判分条件。",
            )
        ],
    }
    source = _source_record(
        "q1",
        "遗漏关键条件",
        rubric_fingerprint=material_rubric_fingerprint(material),
    )
    source["material_id"] = material["id"]

    private_task = build_transfer_task("user-a", source, material)
    public_task = public_transfer_task(private_task)
    serialized = json.dumps(public_task, ensure_ascii=False)

    assert all(not key.startswith("_") for key in public_task)
    assert "_rubric" not in public_task
    assert "_evidence" not in public_task
    assert "TOP-SECRET-RUBRIC" not in serialized
    assert "不可公开的判分条件" not in serialized
    assert private_task["_rubric"].startswith("TOP-SECRET-RUBRIC")


@pytest.mark.parametrize(
    ("question_id", "label", "answer"),
    [
        (
            "q1",
            "遗漏空间压缩影响",
            "不能区分，因为只保留每个通道的全局平均摘要，空间布局和位置分布会丢失。",
        ),
        (
            "q2",
            "未写出瓶颈维度",
            (
                "Squeeze 是 1×1×512，第一层得到 16，第二层 FC2+sigmoid 回到 512，"
                "Scale 后是 14×14×512。"
            ),
        ),
        (
            "q3",
            "未区分 identity 与 residual 分支",
            (
                "不等价；应写成 SE(F(x))+x。SE 只作用于 residual 残差分支，"
                "identity 不门控，在相加之前完成缩放。"
            ),
        ),
    ],
)
def test_senet_transfer_rules_recognize_correct_q1_q2_q3_answers(
    question_id: str,
    label: str,
    answer: str,
):
    task = build_transfer_task(
        "user-a",
        _source_record(question_id, label),
        _senet_material(),
    )

    result = evaluate_senet_transfer(task, answer)

    assert result["score"] == 4
    assert result["max_score"] == 4
    assert result["verdict"] == "transferred"
    assert result["evaluator"] == "rules"
    assert result["evidence"] == [task["_evidence"]]


@pytest.mark.parametrize(
    ("question_id", "label"),
    [
        ("q1", "遗漏空间压缩影响"),
        ("q2", "未写出瓶颈维度"),
        ("q3", "未区分 identity 与 residual 分支"),
    ],
)
def test_senet_transfer_rules_reject_unrelated_answers(question_id: str, label: str):
    task = build_transfer_task(
        "user-a",
        _source_record(question_id, label),
        _senet_material(),
    )

    result = evaluate_senet_transfer(task, "我不知道，也没有根据新情境进行推导。")

    assert result["score"] == 0
    assert result["verdict"] == "not_yet"


def test_transfer_verdict_has_explicit_partial_boundary():
    assert transfer_verdict(0) == "not_yet"
    assert transfer_verdict(1) == "not_yet"
    assert transfer_verdict(2) == "partial"
    assert transfer_verdict(3) == "transferred"
    assert transfer_verdict(4) == "transferred"


def test_uploaded_material_revision_mismatch_fails_closed():
    material = {
        "id": "upload-private-a",
        "title": "已重新生成的上传材料",
        "questions": [
            _question("q1", "concept", "新版问题", "新版私有评分依据"),
        ],
    }
    stale_source = _source_record(
        "q1",
        "遗漏关键条件",
        rubric_fingerprint="0" * 64,
    )
    stale_source["material_id"] = material["id"]

    with pytest.raises(RuntimeError, match="material revision mismatch"):
        build_transfer_task("user-a", stale_source, material)


def test_lowest_scoring_tagged_question_is_the_transfer_target():
    source = _source_record("q1", "遗漏空间压缩影响", score=3)
    source["session_data"]["result"]["question_results"].append(
        {
            "question_id": "q3",
            "score": 0,
            "max_score": 4,
            "misconception_tags": ["未区分 identity 与 residual 分支"],
        }
    )

    task = build_transfer_task("user-a", source, _senet_material())

    assert task["source_question_id"] == "q3"
    assert task["target"]["code"] == "residual_branch_placement"


def test_transfer_migration_marks_server_truth_and_rejects_preoccupied_task_ids():
    root = Path(__file__).resolve().parents[2]
    migration = (
        root / "supabase" / "migrations" / "202608250002_transfer_tasks.sql"
    ).read_text(encoding="utf-8")
    normalized = " ".join(migration.lower().split())

    column_sql = (
        "alter table public.study_records add column if not exists "
        "server_verified_at timestamptz"
    )
    guard_sql = "where session_id ~ '^tr_[0-9a-f]{32}$'"
    assert column_sql in normalized
    assert guard_sql in normalized
    assert "raise exception" in normalized
    assert normalized.index(guard_sql) < normalized.index(
        "create table if not exists public.transfer_tasks"
    )
    assert "interval '2 minutes'" not in normalized
