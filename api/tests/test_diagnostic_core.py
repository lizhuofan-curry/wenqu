"""Pure contract, evidence-state and routing tests for pre-study diagnostics."""

from __future__ import annotations

import hashlib
import json

import pytest

from api.diagnostic_core import (
    BUILTIN_MATERIAL_ID,
    QUESTION_IDS,
    build_question_contract,
    current_scorer_fingerprint,
    diagnostic_id,
    evaluate_diagnostic,
    public_questions,
)


def _material():
    return {
        "id": BUILTIN_MATERIAL_ID,
        "title": "Squeeze-and-Excitation Networks",
        "questions": [
            {"id": "q1", "prompt": "正式题一", "answer_guide": "hidden"},
            {"id": "q2", "prompt": "正式题二", "answer_guide": "hidden"},
            {"id": "q3", "prompt": "正式题三", "answer_guide": "hidden"},
        ],
    }


CORRECT = {
    "p1": "针对当前输入在前向时动态计算权重，通道仍保留；Scale按权重逐通道乘到特征图，形状仍14×14×64，不是永久剪枝。",
    "p2": "1×1×64 → 4 → 64 → 14×14×64",
    "p3": "residual=transform(x)，transform之后经SE，相加之前完成；identity不经过SE。",
}


def _answers(changes=None, confidence="medium"):
    values = {**CORRECT, **(changes or {})}
    return [
        {"question_id": question_id, "response": values[question_id], "confidence": confidence}
        for question_id in QUESTION_IDS
    ]


def _statuses(result):
    return [row["status"] for row in result["objective_results"]]


def test_contract_is_independent_versioned_private_and_public_is_blind():
    material = _material()
    contract = build_question_contract(material)
    assert contract["diagnostic_version"] == 1
    assert len(contract["rubric_fingerprint"]) == 64
    assert contract["scorer_fingerprint"] == current_scorer_fingerprint()
    assert "通道仍保留" not in contract["questions"][0]["prompt"]
    assert "不同输入时可以给出不同权重" not in contract["questions"][0]["prompt"]
    assert [row["id"] for row in contract["questions"]] == list(QUESTION_IDS)
    assert all(row["prompt"] not in {item["prompt"] for item in material["questions"]} for row in contract["questions"])
    assert all({"source", "allowed_inference", "forbidden_inference", "evidence_points"} <= set(row) for row in contract["questions"])
    visible = public_questions(contract)
    assert all(set(row) == {"id", "kind", "prompt"} for row in visible)
    assert "answer_guide" not in str(visible).lower()


def test_diagnostic_id_is_first_baseline_key_not_client_request_key():
    contract = build_question_contract(_material())
    revision = contract["material_revision"]
    first = diagnostic_id("user", BUILTIN_MATERIAL_ID, revision)
    assert first == diagnostic_id("user", BUILTIN_MATERIAL_ID, revision)
    assert first != diagnostic_id("other", BUILTIN_MATERIAL_ID, revision)
    assert first != diagnostic_id("user", BUILTIN_MATERIAL_ID, "a" * 64)


@pytest.mark.parametrize(
    ("changes", "expected", "route"),
    [
        ({}, ["ready", "ready", "ready"], "quick_review"),
        ({"p1": "这里只是调节重要性。"}, ["developing", "ready", "ready"], "focused"),
        ({"p1": "当前输入动态计算权重，通道仍保留。"}, ["developing", "ready", "ready"], "focused"),
        ({"p1": "当前输入用Softmax让通道之间竞争，再做Scale。"}, ["needs_foundation", "ready", "ready"], "full"),
        ({"p2": "1×1×64 → 4"}, ["ready", "developing", "ready"], "focused"),
        ({"p3": "SE在transform之后、相加之前。"}, ["ready", "ready", "developing"], "focused"),
        ({"p1": "权重训练后固定不变，它就是固定剪枝。"}, ["needs_foundation", "ready", "ready"], "full"),
        ({"p2": "瓶颈为4，所以Scale输出4通道。"}, ["ready", "needs_foundation", "ready"], "full"),
        ({"p3": "先相加再SE，identity也经过SE。"}, ["ready", "ready", "needs_foundation"], "full"),
        ({"p1": "永久剪枝", "p2": "Scale输出4通道", "p3": "先相加再SE"}, ["needs_foundation"] * 3, "full"),
        ({"p1": "", "p2": "", "p3": ""}, ["evidence_insufficient"] * 3, "full"),
        ({"p1": "当前输入动态计算，通道仍保留，但它也是永久剪枝。"}, ["needs_foundation", "ready", "ready"], "full"),
        ({"p1": "", "p3": "SE在transform之后、相加之前。"}, ["evidence_insufficient", "ready", "developing"], "focused"),
        ({"p1": "这里只是调节重要性。", "p3": "SE在transform之后、相加之前。"}, ["developing", "ready", "developing"], "focused"),
        ({"p1": "天气很好", "p2": "不知道", "p3": "随便"}, ["evidence_insufficient"] * 3, "full"),
    ],
)
def test_documented_evidence_scenarios(changes, expected, route):
    result = evaluate_diagnostic(build_question_contract(_material()), _answers(changes))
    assert _statuses(result) == expected
    assert result["route_type"] == route
    assert result["recommended_section_id"] == result["recommended_path"][0]
    assert not ({"score", "max_score", "checks", "source"} & set(result))
    assert all(not ({"score", "max_score", "checks", "source"} & set(row)) for row in result["objective_results"])


def test_copying_prompts_is_insufficient_and_confidence_never_changes_evidence():
    contract = build_question_contract(_material())
    copied = [
        {"question_id": row["id"], "response": row["prompt"], "confidence": "high"}
        for row in public_questions(contract)
    ]
    assert _statuses(evaluate_diagnostic(contract, copied)) == ["evidence_insufficient"] * 3
    low = evaluate_diagnostic(contract, _answers(confidence="low"))
    high = evaluate_diagnostic(contract, _answers(confidence="high"))
    assert low == high


def test_natural_negation_is_safe_but_later_contradiction_wins():
    contract = build_question_contract(_material())
    natural = _answers(
        {
            "p1": "这个说法不成立，权重并非固定，而是按当前输入计算；不是Softmax。Scale逐通道乘到特征图，保持64通道，不是把通道永久删除。",
            "p3": "SE在transform之后、相加之前，identity不应该经过SE。",
        }
    )
    assert _statuses(evaluate_diagnostic(contract, natural)) == ["ready", "ready", "ready"]

    contradictory = _answers(
        {"p1": "不是把通道永久删除，但训练结束后其实会永久删除这些通道。"}
    )
    result = evaluate_diagnostic(contract, contradictory)
    assert _statuses(result)[0] == "needs_foundation"
    assert result["route_type"] == "full"



def test_p1_postfix_negation_can_form_complete_ready_evidence():
    answer = (
        "权重不是固定的，而是根据当前输入动态计算。永久删除是不对的，通道不会删除；"
        "Scale把权重逐通道乘到特征图上，通道数仍是64。"
    )
    result = evaluate_diagnostic(
        build_question_contract(_material()),
        _answers({"p1": answer}),
    )
    assert _statuses(result)[0] == "ready"


def test_p1_softmax_postfix_negation_is_not_conflict_but_is_not_evidence_alone():
    result = evaluate_diagnostic(
        build_question_contract(_material()),
        _answers({"p1": "Softmax是不对的。"}),
    )
    assert _statuses(result)[0] == "evidence_insufficient"
    assert result["route_type"] == "focused"


def test_p1_postfix_negation_does_not_hide_later_explicit_contradiction():
    answer = (
        "永久删除并不成立，权重按当前输入动态计算；Scale逐通道乘并保持64通道。"
        "但实际上训练后仍会永久删除不重要通道。"
    )
    result = evaluate_diagnostic(
        build_question_contract(_material()),
        _answers({"p1": answer}),
    )
    assert _statuses(result)[0] == "needs_foundation"
def test_p2_not_restoring_original_shape_is_a_critical_conflict():
    result = evaluate_diagnostic(
        build_question_contract(_material()),
        _answers({"p2": "1×1×64 → 4 → 64，但Scale后未恢复原形状。"}),
    )
    assert _statuses(result)[1] == "needs_foundation"
    assert result["route_type"] == "full"


def test_forged_self_consistent_scorer_fingerprint_is_rejected():
    contract = build_question_contract(_material())
    contract["scorer_fingerprint"] = "0" * 64
    rubric = {key: contract[key] for key in ("diagnostic_version", "scorer_fingerprint", "questions")}
    rubric["material_id"] = BUILTIN_MATERIAL_ID
    payload = json.dumps(rubric, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    contract["rubric_fingerprint"] = hashlib.sha256(payload.encode()).hexdigest()
    with pytest.raises(ValueError, match="scorer fingerprint"):
        evaluate_diagnostic(contract, _answers())


def test_changed_hidden_rubric_fingerprint_is_rejected():
    contract = build_question_contract(_material())
    contract["questions"][0]["evidence_points"][0] = "changed"
    with pytest.raises(ValueError, match="fingerprint"):
        evaluate_diagnostic(contract, _answers())
