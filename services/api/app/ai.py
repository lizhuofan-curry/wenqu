from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from openai import APIConnectionError, AuthenticationError, BadRequestError, OpenAI, RateLimitError
from pydantic import BaseModel, ValidationError

from .config import settings
from .models import EvaluationRequest, EvaluationResult, GeneratedMaterial, MaterialInternal


class AIServiceError(RuntimeError):
    pass


def _provider_label(provider: str) -> str:
    return "DeepSeek" if provider == "deepseek" else "OpenAI"


def _as_service_error(exc: Exception, provider: str) -> AIServiceError:
    label = _provider_label(provider)
    if isinstance(exc, AuthenticationError):
        return AIServiceError(f"{label} API 密钥无效或已失效，请检查后端环境配置。")
    if isinstance(exc, RateLimitError):
        error_code = getattr(exc, "code", None)
        if error_code == "insufficient_quota":
            return AIServiceError(
                f"{label} 项目当前没有可用 API 额度。补充余额或提高项目限额后重试；"
                "内置 SENet 陪读不受影响。"
            )
        return AIServiceError(f"{label} 请求过于频繁，请稍后重试。")
    if isinstance(exc, APIConnectionError):
        return AIServiceError(f"暂时无法连接 {label}，请检查网络后重试。")
    if isinstance(exc, BadRequestError):
        return AIServiceError(f"{label} 拒绝了请求，请检查模型配置或输入格式。")
    if isinstance(exc, (ValidationError, json.JSONDecodeError)):
        return AIServiceError(f"{label} 返回的结构不完整，请重试。")
    return AIServiceError("AI 服务暂时不可用，请稍后重试。")


def extract_source(filename: str, content: bytes) -> tuple[str, str]:
    suffix = Path(filename).suffix.lower()
    if suffix in {".md", ".markdown"}:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Markdown 文件必须使用 UTF-8 编码。") from exc
        return "markdown", text[: settings.max_source_chars]

    if suffix == ".pdf":
        try:
            document = pymupdf.open(stream=content, filetype="pdf")
        except Exception as exc:  # pragma: no cover - library-specific failures
            raise ValueError("PDF 无法打开或文件已损坏。") from exc
        if document.page_count > settings.max_pdf_pages:
            raise ValueError(f"v.0 暂时只支持不超过 {settings.max_pdf_pages} 页的 PDF。")
        pages: list[str] = []
        for index, page in enumerate(document):
            pages.append(f"\n[PDF 第 {index + 1} 页]\n{page.get_text('text')}")
        text = "".join(pages).strip()
        if len(text) < 200:
            raise ValueError("没有提取到足够文字；v.0 暂不支持扫描版 PDF。")
        return "pdf", text[: settings.max_source_chars]

    raise ValueError("只支持 PDF、.md 和 .markdown 文件。")


def _provider() -> tuple[str, OpenAI, str]:
    if settings.ai_provider == "deepseek":
        if not settings.deepseek_api_key:
            raise AIServiceError("后端未配置 DEEPSEEK_API_KEY。")
        return (
            "deepseek",
            OpenAI(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
            ),
            settings.deepseek_model,
        )
    if settings.ai_provider == "openai":
        if not settings.openai_api_key:
            raise AIServiceError("后端未配置 OPENAI_API_KEY。")
        return "openai", OpenAI(api_key=settings.openai_api_key), settings.openai_model
    raise AIServiceError("AI_PROVIDER 只支持 deepseek 或 openai。")


def _structured_completion[StructuredModel: BaseModel](
    model_type: type[StructuredModel],
    *,
    instructions: str,
    prompt: str,
    max_tokens: int,
) -> tuple[StructuredModel, str]:
    provider, client, model = _provider()
    try:
        if provider == "openai":
            response = client.responses.parse(
                model=model,
                reasoning={"effort": "low"},
                instructions=instructions,
                input=prompt,
                text_format=model_type,
                store=False,
            )
            if response.output_parsed is None:
                raise AIServiceError("OpenAI 没有返回可解析的结构化结果。")
            return response.output_parsed, provider

        schema = json.dumps(model_type.model_json_schema(), ensure_ascii=False)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"{instructions}\n"
                        "只输出一个合法 JSON 对象，不要使用 Markdown 代码块。"
                        f"\n必须符合以下 JSON Schema：\n{schema}"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content:
            raise AIServiceError("DeepSeek 没有返回可解析的结构化结果。")
        return model_type.model_validate_json(content), provider
    except AIServiceError:
        raise
    except Exception as exc:
        raise _as_service_error(exc, provider) from exc


def generate_material(filename: str, source_text: str) -> GeneratedMaterial:
    prompt = f"""
你是“个性化陪读阅读室”的内容引擎。根据用户材料生成一个可完成的学习闭环。

硬约束：
1. 所有事实必须来自材料；找不到依据时明确标记边界，不得补造。
2. map 必须依次为 problem、method、evidence、conclusion、limitations。
3. 严格轨给出准确概念、条件和证据；陪读轨只改变表达，不增加事实。
4. 只设计 3 个能判断理解的开放题，答案依据必须带原文页码或章节。
5. source.label 必须使用材料中的页码标记或明确章节。
6. 面向具有基础知识的中文学习者。

文件名：{filename}

材料：
{source_text}
""".strip()
    result, _ = _structured_completion(
        GeneratedMaterial,
        instructions="生成严格基于原材料的学习包，并返回符合 JSON Schema 的 JSON。",
        prompt=prompt,
        max_tokens=8000,
    )
    return result


def evaluate_with_ai(
    material: MaterialInternal,
    request: EvaluationRequest,
    session_id: str,
) -> EvaluationResult:
    hidden_questions = [
        {
            "id": question.id,
            "prompt": question.prompt,
            "answer_guide": question.answer_guide,
            "max_score": question.max_score,
            "source": question.source.model_dump(),
        }
        for question in material.questions
    ]
    payload = {
        "material_title": material.title,
        "learning_goals": material.learning_goals,
        "questions": hidden_questions,
        "answers": [answer.model_dump() for answer in request.answers],
        "retelling": request.retelling,
    }
    result, provider = _structured_completion(
        EvaluationResult,
        instructions=(
            "你是严格的学习诊断器。按评分依据逐项评分。"
            "反馈必须引用给定 source，不得编造材料内容。"
            "返回 JSON，evaluator 暂时填写 openai，服务端会按实际提供商校正。"
        ),
        prompt=json.dumps(payload, ensure_ascii=False),
        max_tokens=6000,
    )
    return result.model_copy(update={"evaluator": provider})
