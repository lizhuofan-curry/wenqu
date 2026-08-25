"""Versioned, deterministic and answer-blind pre-study SENet diagnostics."""

from __future__ import annotations

import hashlib
import inspect
import json
import re
from typing import Any

from api.transfer_core import material_rubric_fingerprint

DIAGNOSTIC_VERSION = 1
BUILTIN_MATERIAL_ID = "senet-cvpr-2018"
SECTION_IDS = ("squeeze", "excitation", "scale", "resnet")
QUESTION_IDS = ("p1", "p2", "p3")

_QUESTIONS = (
    {
        "id": "p1",
        "kind": "concept",
        "prompt": "有人认为 SE 在训练结束后会永久删除不重要的通道。请判断这个说法是否成立，并说明通道权重是否固定、Scale 在前向过程中做什么。",
        "objective_id": "channel_recalibration",
        "objective_label": "区分输入相关重标定与永久剪枝",
        "target_sections": ["excitation", "scale"],
        "evidence_points": ["当前输入前向时动态计算权重", "通道仍保留而非永久删除", "Scale逐通道缩放且保持64通道"],
        "conflict_priority": ["权重固定且与输入无关", "通道被永久剪除", "用Softmax制造通道竞争"],
        "source": {"page": "PDF 3", "formula": "(3)-(4)", "figure": "Figure 1"},
        "allowed_inference": ["不同样本可产生不同权重", "Scale逐通道相乘且不改变64个通道"],
        "forbidden_inference": ["SE 等同于永久剪枝", "训练后权重与输入无关", "Softmax使通道权重相互竞争"],
    },
    {
        "id": "p2",
        "kind": "tensor",
        "prompt": "给定输入 U 的形状为 14×14×64，reduction ratio r=16。请依次写出 Squeeze、第一层全连接、第二层全连接加 sigmoid、Scale 输出的形状。",
        "objective_id": "tensor_shapes",
        "objective_label": "推导 Squeeze、Excitation、Scale 的张量形状",
        "target_sections": ["squeeze", "excitation", "scale"],
        "evidence_points": ["1×1×64 后降到 4", "恢复到 64 后缩放回 14×14×64"],
        "conflict_priority": ["把 4 当成最终通道数", "Scale 后改变原特征形状"],
        "source": {"page": "PDF 3", "formula": "(2)-(4)", "figure": "Figure 1"},
        "allowed_inference": ["64/16=4", "权重广播到 14×14 空间"],
        "forbidden_inference": ["Scale 输出 4 通道", "Squeeze 保留 14×14 空间"],
    },
    {
        "id": "p3",
        "kind": "structure",
        "prompt": "请写一段简短 residual 伪代码，标出 SE 应放在 transform 之后、与 identity 相加之前；并说明 identity 分支是否经过 SE。",
        "objective_id": "residual_placement",
        "objective_label": "判断 SE 在 ResNet 残差分支中的位置",
        "target_sections": ["resnet"],
        "evidence_points": ["SE 位于 transform 后、add identity 前", "identity 绕过 SE"],
        "conflict_priority": ["先相加再经过 SE", "identity 也由 SE 缩放"],
        "source": {"page": "PDF 4", "formula": None, "figure": "Figure 3"},
        "allowed_inference": ["residual = SE(transform(x)); out = residual + identity(x)"],
        "forbidden_inference": ["out = SE(transform(x) + identity(x))", "identity 必须经过 SE"],
    },
)


def _hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def diagnostic_id(user_id: str, material_id: str, material_revision: str, diagnostic_version: int = DIAGNOSTIC_VERSION) -> str:
    value = f"v{diagnostic_version}|{user_id}|{material_id}|{material_revision}"
    return "dg_" + hashlib.sha256(value.encode()).hexdigest()[:32]


def build_question_contract(material: dict) -> dict:
    if material.get("id") != BUILTIN_MATERIAL_ID:
        raise ValueError("unsupported material")
    questions = json.loads(json.dumps(_QUESTIONS, ensure_ascii=False))
    scorer_fingerprint = current_scorer_fingerprint()
    rubric = {
        "diagnostic_version": DIAGNOSTIC_VERSION,
        "material_id": BUILTIN_MATERIAL_ID,
        "scorer_fingerprint": scorer_fingerprint,
        "questions": questions,
    }
    return {
        "diagnostic_version": DIAGNOSTIC_VERSION,
        "material_revision": material_rubric_fingerprint(material),
        "rubric_fingerprint": _hash(rubric),
        "scorer_fingerprint": scorer_fingerprint,
        "questions": questions,
    }


def _questions(contract: dict) -> list[dict]:
    questions = contract.get("questions")
    if contract.get("diagnostic_version") != DIAGNOSTIC_VERSION or not isinstance(questions, list):
        raise ValueError("invalid diagnostic contract")
    if [row.get("id") for row in questions if isinstance(row, dict)] != list(QUESTION_IDS):
        raise ValueError("invalid diagnostic contract")
    scorer_fingerprint = contract.get("scorer_fingerprint")
    if scorer_fingerprint != current_scorer_fingerprint():
        raise ValueError("diagnostic scorer fingerprint mismatch")
    rubric = {
        "diagnostic_version": DIAGNOSTIC_VERSION,
        "material_id": BUILTIN_MATERIAL_ID,
        "scorer_fingerprint": scorer_fingerprint,
        "questions": questions,
    }
    if contract.get("rubric_fingerprint") != _hash(rubric):
        raise ValueError("diagnostic rubric fingerprint mismatch")
    return questions


def public_questions(contract: dict) -> list[dict]:
    return [{"id": row["id"], "kind": row["kind"], "prompt": row["prompt"]} for row in _questions(contract)]


def normalize_answers(answers: list[dict]) -> list[dict]:
    if len(answers) != 3:
        raise ValueError("three answers required")
    normalized, seen = [], set()
    for answer in answers:
        question_id = str(answer.get("question_id") or "")
        confidence = answer.get("confidence")
        if question_id not in QUESTION_IDS or question_id in seen or confidence not in {"low", "medium", "high"}:
            raise ValueError("answers must contain p1, p2 and p3 once")
        seen.add(question_id)
        normalized.append({"question_id": question_id, "response": str(answer.get("response") or "")[:4000], "confidence": confidence})
    if seen != set(QUESTION_IDS):
        raise ValueError("answers must contain p1, p2 and p3 once")
    return sorted(normalized, key=lambda row: QUESTION_IDS.index(row["question_id"]))


def _compact(value: Any) -> str:
    return re.sub(r"[\s，。；、,:：;（）()]+", "", str(value or "").lower())


def _any(text: str, terms: tuple[str, ...]) -> bool:
    return any(_compact(term) in text for term in terms)


def _wrong(text: str, phrase: str) -> bool:
    phrase = _compact(phrase)
    start = 0
    while (index := text.find(phrase, start)) >= 0:
        prefix = text[max(0, index - 12):index]
        suffix = text[index + len(phrase):index + len(phrase) + 10]
        prefix_negated = re.search(r"(?:不是|并非|不会|没有|不应该|不应|无需|不能).{0,5}$", prefix)
        suffix_negated = re.match(r"(?:是)?(?:不对的|错误的|并不成立|不成立|不是事实)", suffix)
        if prefix_negated is None and suffix_negated is None:
            return True
        start = index + 1
    return False


def _score_p1(text: str) -> tuple[int | None, bool]:
    conflict = any(
        _wrong(text, phrase)
        for phrase in ("固定剪枝", "永久剪枝", "永久删除", "永久剪除", "权重固定不变", "与输入无关", "softmax", "通道之间竞争", "权重和为1")
    )
    if conflict:
        return 0, True
    dynamic = _any(text, ("当前输入", "每个输入", "不同输入", "不同样本", "动态计算", "前向计算"))
    retained = _any(text, ("通道仍保留", "通道保留", "不删除通道", "不会删除", "不是剪枝", "不是把通道永久删除", "通道不会被删除", "通道不会删除", "通道没有删除", "只是缩放"))
    scale_action = _any(text, ("逐通道乘", "乘到特征图", "scale缩放", "按权重缩放", "只是缩放"))
    scale_shape = _any(text, ("通道仍64", "通道数仍是64", "保持64通道", "形状仍14×14×64", "不改变形状", "通道数不变"))
    generic = _any(text, ("重标定", "调节重要性", "通道权重", "加权"))
    return (2 if dynamic and retained and scale_action and scale_shape else 1 if dynamic or retained or scale_action or scale_shape or generic else None), False


def _score_p2(text: str) -> tuple[int | None, bool]:
    conflict = any(_wrong(text, phrase) for phrase in ("最终4通道", "输出4通道", "scale后是4", "scale输出4")) or _any(
        text,
        ("scale后未恢复原形状", "scale后没有恢复原形状", "scale不恢复原形状", "scale改变原形状"),
    )
    if conflict:
        return 0, True
    groups = (("1×1×64", "1x1x64"), ("→4", "到4", "瓶颈为4", "瓶颈4"), ("→64", "到64", "恢复到64", "输出64"), ("14×14×64", "14x14x64"))
    positions, cursor = [], 0
    for group in groups:
        found = [text.find(_compact(term), cursor) for term in group]
        found = [item for item in found if item >= 0]
        position = min(found) if found else -1
        positions.append(position)
        if position >= 0:
            cursor = position + 1
    count = sum(item >= 0 for item in positions)
    return (2 if count == 4 else 1 if count >= 2 else None), False


def _score_p3(text: str) -> tuple[int | None, bool]:
    conflict = any(_wrong(text, phrase) for phrase in ("相加之后再se", "先相加再se", "identity也经过se", "恒等分支也经过se", "identity也缩放"))
    if conflict or "se(transform(x)+identity(x))" in text:
        return 0, True
    placement = (_any(text, ("transform之后", "变换之后", "残差变换之后")) and _any(text, ("相加之前", "add之前", "加identity之前"))) or _any(text, ("se(transform(x))+identity(x)", "residual=se(transform(x))"))
    bypass = _any(text, ("identity绕过se", "identity不经过se", "identity不应该经过se", "恒等分支不经过se", "identity不缩放"))
    return (2 if placement and bypass else 1 if placement or bypass else None), False


def _summary(status: str) -> str:
    return {
        "ready": "本次回答为该目标提供了完整的课前证据；仍需在正式学习后用异题确认。",
        "developing": "本次回答提供了部分课前证据，建议聚焦对应段落核对。",
        "needs_foundation": "本次回答出现了与该目标冲突的证据，建议从基础机制开始核对。",
        "evidence_insufficient": "本次回答尚无充分证据，暂不作能力或错因判断。",
    }[status]


def evaluate_diagnostic(contract: dict, answers: list[dict]) -> dict:
    normalized, questions = normalize_answers(answers), _questions(contract)
    by_id = {row["id"]: row for row in questions}
    scorers = {"p1": _score_p1, "p2": _score_p2, "p3": _score_p3}
    results, section_map, critical_conflicts = [], {}, []
    for answer in normalized:
        question, response = by_id[answer["question_id"]], answer["response"]
        text, prompt = _compact(response), _compact(question["prompt"])
        copied = text == prompt or (len(text) >= 20 and text in prompt)
        score, conflict = (None, False) if copied else scorers[answer["question_id"]](text)
        if not conflict and len(text) < 6:
            score = None
        status = "needs_foundation" if conflict else "evidence_insufficient" if score is None else "ready" if score == 2 else "developing"
        objective_id = question["objective_id"]
        section_map[objective_id] = question["target_sections"]
        results.append({"objective_id": objective_id, "label": question["objective_label"], "status": status, "summary": _summary(status)})
        critical_conflicts.append(conflict)
    statuses = [row["status"] for row in results]
    severe_count = sum(status in {"needs_foundation", "evidence_insufficient"} for status in statuses)
    gaps = [row for row in results if row["status"] != "ready"]
    if not gaps:
        route_type, route_reason, path = "quick_review", "三项目标均已展示完整课前证据，先快速复核；这不代表已掌握 SENet。", ["resnet", "scale"]
    elif any(critical_conflicts) or severe_count >= 2:
        route_type, route_reason, path = "full", "检测到关键混淆或多个目标尚缺充分证据，建议按依赖顺序完整学习。", list(SECTION_IDS)
    else:
        route_type, route_reason = "focused", "当前证据适合聚焦一个或多个目标，不需要因部分证据自动回到完整路线。"
        path = []
        for gap in gaps:
            for section in section_map[gap["objective_id"]]:
                if section not in path:
                    path.append(section)
    return {
        "objective_results": results,
        "route_type": route_type,
        "route_reason": route_reason,
        "recommended_path": path,
        "recommended_section_id": path[0],
        "summary": "已根据三项目标的课前证据生成建议起点；结果不是完整能力或掌握度判定。",
    }


def current_scorer_fingerprint() -> str:
    """Bind persisted contracts to the exact executable deterministic scorer."""
    functions = (
        _compact,
        _any,
        _wrong,
        _score_p1,
        _score_p2,
        _score_p3,
        _summary,
        evaluate_diagnostic,
    )
    source = "\n".join(inspect.getsource(function) for function in functions)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()
