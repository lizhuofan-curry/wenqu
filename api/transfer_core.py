"""Deterministic, evidence-bound misconception transfer tasks.

This module is deliberately free of database and web-framework dependencies so
the Vercel entrypoint can rebuild a private task after a cold start.  Public
task payloads never include the rubric or the expected answer.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

TRANSFER_GENERATION_VERSION = 1



def material_rubric_fingerprint(material: dict) -> str:
    """Hash the private question contract without exposing the rubric."""
    questions = material.get("questions")
    if not isinstance(questions, list):
        questions = []
    parts = [str(material.get("id", ""))]
    for question in questions:
        if not isinstance(question, dict):
            continue
        parts.extend(
            str(question.get(key, ""))
            for key in ("id", "kind", "prompt", "answer_guide", "max_score", "source")
        )
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()

def _clean_label(value: Any) -> str:
    return str(value or "").strip()[:80]


def _target_code(question_id: str, label: str) -> str:
    lowered = label.lower()
    known = (
        (("空间", "位置", "分布"), "spatial_information_loss"),
        (("瓶颈", "c/r", "维度"), "bottleneck_dimension"),
        (("identity", "residual", "分支", "插入"), "residual_branch_placement"),
        (("关键步骤", "流程", "遗漏"), "incomplete_process"),
        (("复述过短",), "insufficient_explanation"),
    )
    for terms, code in known:
        if any(term in lowered for term in terms):
            return code
    normalized = re.sub(r"\W+", "", lowered, flags=re.UNICODE)
    digest = hashlib.sha256(
        f"{question_id}|{normalized}".encode()
    ).hexdigest()[:12]
    return f"concept_{digest}"


def _question_results(source_record: dict) -> list[dict]:
    session_data = source_record.get("session_data")
    if not isinstance(session_data, dict):
        return []
    result = session_data.get("result")
    if not isinstance(result, dict):
        return []
    rows = result.get("question_results")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _pick_target(source_record: dict, questions: list[dict]) -> tuple[dict, str, str]:
    question_by_id = {
        str(question.get("id", "")): question
        for question in questions
        if isinstance(question, dict)
    }
    candidates: list[tuple[float, dict, str]] = []
    for row in _question_results(source_record):
        question_id = str(row.get("question_id", ""))
        tags = row.get("misconception_tags")
        labels = [_clean_label(tag) for tag in tags] if isinstance(tags, list) else []
        labels = [label for label in labels if label]
        if question_id not in question_by_id or not labels:
            continue
        try:
            score = float(row.get("score", 0))
            maximum = max(float(row.get("max_score", 1)), 1)
        except (TypeError, ValueError):
            score, maximum = 0.0, 1.0
        candidates.append((score / maximum, question_by_id[question_id], labels[0]))

    if candidates:
        _ratio, question, label = min(candidates, key=lambda item: item[0])
        return question, label, _target_code(str(question.get("id", "q1")), label)

    aggregate = source_record.get("misconception_tags")
    labels = [_clean_label(tag) for tag in aggregate] if isinstance(aggregate, list) else []
    labels = [label for label in labels if label]
    if not labels:
        raise ValueError("source has no misconception")
    question = question_by_id.get("q1") or next(iter(question_by_id.values()), None)
    if question is None:
        raise ValueError("material has no question")
    label = labels[0]
    return question, label, _target_code(str(question.get("id", "q1")), label)


def _senet_variant(question_id: str) -> tuple[str, str, str]:
    variants = {
        "q1": (
            "同均值、不同布局",
            "两张特征图在某个通道上的全局平均值完全相同，但目标区域分别集中在左上角和右下角。经过 Squeeze 后，SE block 能否区分这两种空间布局？请说明它保留了什么、丢失了什么。",
            "应指出不能仅凭 Squeeze 后的通道均值区分两种布局；它保留每个通道的全局统计摘要，但压缩具体空间位置和分布。",
        ),
        "q2": (
            "换一组输入尺寸",
            "现在输入 U 的形状改为 14×14×512，reduction ratio r=32。请依次写出 Squeeze、第一层 FC、第二层 FC+sigmoid、Scale 后的形状，并说明哪一步改变空间尺寸。",
            "正确形状为 1×1×512 → 16 → 512 → 14×14×512；Squeeze 压缩空间维，Scale 恢复到输入空间形状，瓶颈只改变通道维。",
        ),
        "q3": (
            "判断一个改造方案",
            "有人把 SE 放在 residual 与 identity 相加之后，写成 SE(F(x)+x)。这与论文的 SE-ResNet 是否等价？请给出论文对应写法，并说明 identity 路径是否应被门控。",
            "不等价。论文对应 SE(F(x))+x：SE 只门控 residual/non-identity 分支，之后才与未被门控的 identity 路径相加。",
        ),
    }
    return variants.get(question_id, variants["q1"])


def _generic_variant(question: dict) -> tuple[str, str, str]:
    kind = str(question.get("kind", "concept")).lower()
    original = str(question.get("prompt", "")).strip()
    rubric = str(question.get("answer_guide", "")).strip()
    if kind in {"tensor", "shape", "calculation"}:
        scenario = "改变一个输入条件"
        prompt = (
            f"原问题关注的是“{original}”。请自行改变其中一个输入维度或超参数，"
            "给出一组新的具体数值，重新推导结果，并说明哪些量改变、哪些关系保持不变。"
        )
        transfer_rule = "必须提供不同于原题的新数值、完整推导和不变量说明。"
    elif kind in {"structure", "position", "architecture"}:
        scenario = "检验一个结构改动"
        prompt = (
            f"围绕“{original}”，假设把关键结构移动到相邻步骤或替换其中一条路径。"
            "判断结论是否仍成立，并用原理说明这个改动会造成什么差异。"
        )
        transfer_rule = "必须分析一个新结构情境、明确是否等价并给出机制理由。"
    elif kind == "evidence":
        scenario = "辨别一条新证据"
        prompt = (
            f"原问题是“{original}”。现在出现一个表面上支持相反结论的新案例。"
            "请说明应检查哪些条件，才能判断它是真正反例还是适用边界不同。"
        )
        transfer_rule = "必须区分反例与适用边界，并说明需要核对的原文条件。"
    else:
        scenario = "换一个具体情境"
        prompt = (
            f"不要复述原题答案。请为“{original}”构造一个原题没有出现的新情境，"
            "说明同一原理如何应用，并指出至少一个成立条件或失效边界。"
        )
        transfer_rule = "必须包含新情境、原理映射和至少一个条件或边界。"
    hidden_rubric = f"{rubric}\n迁移判定：{transfer_rule}".strip()
    return scenario, prompt[:1200], hidden_rubric[:2400]


def build_transfer_task(user_id: str, source_record: dict, material: dict) -> dict:
    questions = material.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError("material has no questions")
    material_revision = material_rubric_fingerprint(material)
    source_session_data = source_record.get("session_data")
    source_revision = (
        source_session_data.get("rubric_fingerprint")
        if isinstance(source_session_data, dict)
        else None
    )
    if (
        material.get("id") != "senet-cvpr-2018"
        and source_revision != material_revision
    ):
        raise RuntimeError("material revision mismatch")

    question, label, code = _pick_target(source_record, questions)
    question_id = str(question.get("id", "q1"))
    if material.get("id") == "senet-cvpr-2018":
        scenario, prompt, rubric = _senet_variant(question_id)
    else:
        scenario, prompt, rubric = _generic_variant(question)
    source_session_id = str(source_record.get("session_id", ""))
    identity = (
        f"v{TRANSFER_GENERATION_VERSION}|{user_id}|{source_session_id}|"
        f"{question_id}|{code}|{material_revision}"
    )
    task_id = "tr_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    evidence = question.get("source")
    if not isinstance(evidence, dict):
        evidence = {"label": "原文证据", "detail": None}
    return {
        "id": task_id,
        "source_session_id": source_session_id,
        "source_question_id": question_id,
        "material_id": str(material.get("id", "")),
        "material_title": str(material.get("title", ""))[:500],
        "scenario_label": scenario,
        "target": {"code": code, "label": label},
        "prompt": prompt,
        "generation_version": TRANSFER_GENERATION_VERSION,
        "material_revision": material_revision,
        "status": "ready",
        "_rubric": rubric,
        "_evidence": {
            "label": str(evidence.get("label") or "原文证据")[:500],
            "detail": str(evidence.get("detail") or "")[:500] or None,
        },
    }


def public_transfer_task(task: dict) -> dict:
    return {key: value for key, value in task.items() if not key.startswith("_")}


def transfer_verdict(score: int, maximum: int = 4) -> str:
    if score >= max(3, maximum - 1):
        return "transferred"
    if score >= 2:
        return "partial"
    return "not_yet"


def evaluate_senet_transfer(task: dict, answer: str) -> dict:
    text = answer.lower().replace(" ", "")
    question_id = task["source_question_id"]
    score = 0
    if question_id == "q1":
        score += int(any(term in text for term in ("不能", "无法", "不可区分", "相同")))
        score += int(any(term in text for term in ("全局平均", "均值", "全局统计", "摘要")))
        score += int(any(term in text for term in ("空间位置", "空间布局", "分布", "左上", "右下")))
        score += int(any(term in text for term in ("保留通道", "每个通道", "通道信息")))
    elif question_id == "q2":
        score += int(any(term in text for term in ("1×1×512", "1x1x512")))
        score += int("16" in text)
        score += int("512" in text and any(term in text for term in ("sigmoid", "第二层", "fc2")))
        score += int(any(term in text for term in ("14×14×512", "14x14x512")))
    else:
        score += int(any(term in text for term in ("不等价", "不相同", "不同")))
        score += int(any(term in text for term in ("se(f(x))+x", "se(residual(x))+identity(x)", "相加之前")))
        score += int(any(term in text for term in ("residual", "non-identity", "残差分支")))
        score += int(any(term in text for term in ("identity不", "恒等分支不", "不门控", "不缩放")))
    verdict = transfer_verdict(score)
    feedback = {
        "transferred": "你已经把原理用于新的表层情境，并说明了关键机制。",
        "partial": "方向基本正确，但新情境中的条件、推导或边界还不完整。",
        "not_yet": "回答仍停留在结论记忆，需要把原理映射到题目给出的新情境。",
    }[verdict]
    return {
        "score": score,
        "max_score": 4,
        "verdict": verdict,
        "feedback": feedback,
        "evidence": [task["_evidence"]],
        "next_step": (
            "保留这次迁移结论，等待 D3/D7 再检查保持。"
            if verdict == "transferred"
            else "回看这条原文证据，再用题目中的新情境完整解释一次。"
        ),
        "evaluator": "rules",
    }

