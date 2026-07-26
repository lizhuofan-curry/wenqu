from __future__ import annotations

import re

from .models import (
    EvaluationRequest,
    EvaluationResult,
    MaterialInternal,
    QuestionResult,
    RetellingResult,
    SourceRef,
)


def _contains(text: str, *terms: str) -> bool:
    return any(term.lower() in text.lower() for term in terms)


def _verdict(score: int, max_score: int) -> str:
    ratio = score / max_score
    if ratio >= 0.75:
        return "掌握"
    if ratio >= 0.4:
        return "部分掌握"
    return "需要回看"


def _question_one(response: str, source: SourceRef) -> QuestionResult:
    score = 0
    tags: list[str] = []
    if _contains(response, "全局", "整张", "整体") and _contains(response, "平均", "池化"):
        score += 1
    if _contains(response, "每个通道", "各通道", "通道描述", "通道统计"):
        score += 1
    if _contains(response, "上下文", "全局信息", "全局统计"):
        score += 1
    if _contains(response, "空间位置", "位置信息", "空间分布", "细节位置"):
        score += 1
    else:
        tags.append("遗漏-聚合代价")

    if _contains(response, "所有通道压成一个", "变成一个通道"):
        tags.append("概念混淆-空间与通道")
        score = min(score, 1)
    if _contains(response, "删除", "剪掉", "只保留"):
        tags.append("概念混淆-重标定与剪枝")

    feedback = (
        "你说明了每个通道的全局统计及其空间信息代价。"
        if score >= 3
        else "Squeeze 是分别压缩每个通道的空间维度，仍保留 C 个通道描述；"
        "它获得全局统计，但会压缩具体空间位置。"
    )
    return QuestionResult(
        question_id="q1",
        score=score,
        max_score=4,
        verdict=_verdict(score, 4),
        feedback=feedback,
        misconception_tags=tags,
        source=source,
    )


def _question_two(response: str, source: SourceRef) -> QuestionResult:
    compact = re.sub(r"\s+", "", response.lower()).replace("×", "x").replace("*", "x")
    checks = [
        bool(re.search(r"1x1x256|256(?:维|个)?", compact)),
        bool(re.search(r"(?:^|[^0-9])16(?:维|个|[^0-9]|$)", compact)),
        compact.count("256") >= 2,
        bool(re.search(r"32x32x256", compact)),
    ]
    score = sum(checks)
    tags: list[str] = []
    if "32x32x16" in compact:
        tags.extend(["概念混淆-瓶颈维与特征图维", "概念混淆-SE改变输出通道数"])
        score = min(score, 2)
    if _contains(response, "保留16个通道", "选16个通道"):
        tags.append("概念混淆-reduction-ratio")

    feedback = (
        "四个阶段的形状正确，r=16 只影响中间瓶颈维度。"
        if score == 4
        else "正确形状应为 1×1×256 → 16 → 256 → 32×32×256；SE 不改变最终通道数。"
    )
    return QuestionResult(
        question_id="q2",
        score=score,
        max_score=4,
        verdict=_verdict(score, 4),
        feedback=feedback,
        misconception_tags=tags,
        source=source,
    )


def _question_three(response: str, source: SourceRef) -> QuestionResult:
    score = 0
    tags: list[str] = []
    chose_b = bool(re.search(r"(^|[^\w])b([^\w]|$)", response.lower())) or _contains(
        response, "选择b", "选b"
    )
    if chose_b:
        score += 1
    else:
        tags.append("结构错误-SE插入位置")
    if _contains(response, "residual", "残差分支", "非恒等分支"):
        score += 1
    if _contains(response, "相加之前", "先se", "缩放后再", "再与identity", "再和identity"):
        score += 1
    if _contains(response, "identity也", "两条分支都"):
        tags.append("概念混淆-残差双分支")

    feedback = (
        "选择 B，并正确说明 residual 分支先经过 SE，再与 identity 相加。"
        if score == 3
        else "论文 Figure 3 对应 B：SE 只缩放 residual/non-identity branch，"
        "完成后才与 identity 相加。"
    )
    return QuestionResult(
        question_id="q3",
        score=score,
        max_score=3,
        verdict=_verdict(score, 3),
        feedback=feedback,
        misconception_tags=tags,
        source=source,
    )


def _retelling(response: str) -> RetellingResult:
    dimensions = [
        _contains(response, "通道依赖", "通道关系", "通道重要性"),
        _contains(response, "全局平均", "全局池化") and _contains(response, "每个通道", "空间"),
        _contains(response, "全连接", "门控", "sigmoid")
        and _contains(response, "缩放", "乘", "权重"),
        _contains(response, "residual", "残差分支")
        and _contains(response, "identity", "恒等", "相加"),
    ]
    score = sum(2 for passed in dimensions if passed)
    feedback = (
        "复述覆盖了问题、Squeeze、Excitation/Scale 和 ResNet 接入位置。"
        if score >= 7
        else "复述已经有主线，但还需要补齐：为什么要显式建模通道关系、"
        "空间压缩的含义、门控如何生成权重，以及 residual 与 identity 的先后关系。"
    )
    return RetellingResult(score=score, feedback=feedback)


def evaluate_senet(material: MaterialInternal, request: EvaluationRequest) -> EvaluationResult:
    by_id = {answer.question_id: answer.response for answer in request.answers}
    source_by_id = {question.id: question.source for question in material.questions}
    results = [
        _question_one(by_id.get("q1", ""), source_by_id["q1"]),
        _question_two(by_id.get("q2", ""), source_by_id["q2"]),
        _question_three(by_id.get("q3", ""), source_by_id["q3"]),
    ]
    retelling = _retelling(request.retelling)
    total_score = sum(result.score for result in results) + retelling.score
    max_score = sum(result.max_score for result in results) + retelling.max_score
    mastery = round(total_score / max_score * 100)
    tags = list(dict.fromkeys(tag for result in results for tag in result.misconception_tags))
    review_sources = list(
        {
            (result.source.label, result.source.detail): result.source
            for result in results
            if result.verdict != "掌握"
        }.values()
    )

    if mastery >= 80:
        headline = "你已经抓住了 SE block 的机制"
        summary = "形状、门控和残差接入位置形成了完整理解。"
        next_step = "尝试独立写出一个 PyTorch SEBlock，并用张量打印验证每一步形状。"
    elif mastery >= 55:
        headline = "主线已经建立，还差几个关键连接"
        summary = "你记住了流程，但部分概念还没有和张量或网络结构对齐。"
        next_step = "按诊断回看对应页码，再用不超过五句话重新复述一次。"
    else:
        headline = "先别急着往后走，当前还有基础混淆"
        summary = "Squeeze 的维度、门控含义或残差插入位置仍需重新建立。"
        next_step = "回看 PDF 第 3 页公式（2）—（4）和第 4 页 Figure 3，然后重新作答。"

    return EvaluationResult(
        total_score=total_score,
        max_score=max_score,
        mastery=mastery,
        headline=headline,
        summary=summary,
        question_results=results,
        retelling=retelling,
        misconception_tags=tags,
        review_sources=review_sources,
        next_step=next_step,
        evaluator="rules",
    )
