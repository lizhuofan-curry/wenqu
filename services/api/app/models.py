from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    label: str
    detail: str | None = None


class Persona(BaseModel):
    id: str
    name: str
    tagline: str
    tone: str
    accent: str


class MapItem(BaseModel):
    key: Literal["problem", "method", "evidence", "conclusion", "limitations"]
    title: str
    summary: str
    source: SourceRef


class LearningSection(BaseModel):
    id: str
    title: str
    eyebrow: str
    strict_track: str
    companion_track: str
    source: SourceRef


class QuestionPublic(BaseModel):
    id: str
    kind: Literal["concept", "tensor", "structure", "evidence"]
    prompt: str
    hint: str | None = None
    source: SourceRef


class QuestionInternal(QuestionPublic):
    answer_guide: str
    max_score: int = 4


class MaterialPublic(BaseModel):
    id: str
    title: str
    subtitle: str
    source_type: Literal["builtin", "pdf", "markdown"]
    estimated_minutes: int
    difficulty: str
    progress: int = 0
    map: list[MapItem]
    learning_goals: list[str]
    sections: list[LearningSection]
    questions: list[QuestionPublic]
    created_at: str


class MaterialInternal(MaterialPublic):
    questions: list[QuestionInternal]  # type: ignore[assignment]


class MaterialSummary(BaseModel):
    id: str
    title: str
    subtitle: str
    source_type: str
    estimated_minutes: int
    difficulty: str
    progress: int
    created_at: str


class SessionCreate(BaseModel):
    material_id: str
    persona_id: str = "huangfeng"


class SessionPublic(BaseModel):
    id: str
    material_id: str
    persona_id: str
    status: Literal["active", "completed"]
    started_at: str
    completed_at: str | None = None
    result: EvaluationResult | None = None


class AnswerInput(BaseModel):
    question_id: str
    response: str = Field(min_length=1, max_length=3000)


class EvaluationRequest(BaseModel):
    answers: list[AnswerInput] = Field(min_length=1)
    retelling: str = Field(min_length=20, max_length=5000)


class QuestionResult(BaseModel):
    question_id: str
    score: int
    max_score: int
    verdict: Literal["掌握", "部分掌握", "需要回看"]
    feedback: str
    misconception_tags: list[str] = Field(default_factory=list)
    source: SourceRef


class RetellingResult(BaseModel):
    score: int
    max_score: int = 8
    feedback: str


class EvaluationResult(BaseModel):
    total_score: int
    max_score: int
    mastery: int = Field(ge=0, le=100)
    headline: str
    summary: str
    question_results: list[QuestionResult]
    retelling: RetellingResult
    misconception_tags: list[str]
    review_sources: list[SourceRef]
    next_step: str
    evaluator: Literal["rules", "openai"]


class ArchiveItem(BaseModel):
    session_id: str
    material_id: str
    material_title: str
    persona_name: str
    completed_at: str
    mastery: int
    headline: str
    misconception_tags: list[str]
    retelling: str


class GeneratedMaterial(BaseModel):
    title: str
    subtitle: str
    estimated_minutes: int = Field(ge=10, le=90)
    difficulty: str
    map: list[MapItem] = Field(min_length=5, max_length=5)
    learning_goals: list[str] = Field(min_length=3, max_length=3)
    sections: list[LearningSection] = Field(min_length=1, max_length=4)
    questions: list[QuestionInternal] = Field(min_length=3, max_length=3)
