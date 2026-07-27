"""Vercel serverless entry point for the wenqu API.

When deployed to Vercel, every request matching /api/* is routed here.
The FastAPI app is mounted as an ASGI application.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Dict, List

# Vercel adds <project-root>/api to sys.path.  Add <project-root> so we can
# import from services/api/app.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Config (reads from Vercel env vars, no .env.local needed) ----------------
@dataclass(frozen=True)
class Settings:
    app_name: str = "问渠 API"
    app_env: str = os.getenv("APP_ENV", "production")
    ai_provider: str = (os.getenv("AI_PROVIDER", "openai") or "openai").lower()
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.6-luna") or "gpt-5.6-luna"
    deepseek_api_key: str | None = os.getenv("DEEPSEEK_API_KEY")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash") or "deepseek-v4-flash"
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com") or "https://api.deepseek.com"


settings = Settings()

# --- In-memory store (stateless, rebuilt on cold start) -----------------------
class MemStore:
    def __init__(self):
        self._materials: Dict[str, dict] = {}
        self._sessions: Dict[str, dict] = {}

    def seed_senet(self, senet: dict):
        self._materials[senet["id"]] = senet

    def list_materials(self) -> List[dict]:
        return list(self._materials.values())

    def get_material(self, mid: str) -> dict | None:
        return self._materials.get(mid)

    def create_session(self, sid: str, mid: str, pid: str) -> dict:
        s = {
            "id": sid, "material_id": mid, "persona_id": pid,
            "status": "active", "started_at": datetime.now(UTC).isoformat(),
        }
        self._sessions[sid] = s
        return s

    def get_session(self, sid: str) -> dict | None:
        return self._sessions.get(sid)

    def complete_session(self, sid: str, answers: list, retelling: str, result: dict) -> dict:
        s = self._sessions[sid]
        s["status"] = "completed"
        s["completed_at"] = datetime.now(UTC).isoformat()
        s["answers_json"] = json.dumps(answers, ensure_ascii=False)
        s["retelling"] = retelling
        s["result_json"] = json.dumps(result, ensure_ascii=False)
        return s

    def archive_rows(self) -> List[dict]:
        return [s for s in self._sessions.values() if s["status"] == "completed"]


store = MemStore()

# --- Seed built-in SENet material --------------------------------------------
# We create a minimal SENet dict inline so we don't pull in content.py (which
# imports the MaterialInternal model with heavy sub-models).  Only the fields
# actually read by scoring / API are populated.
SENET_MATERIAL = dict(
    id="senet-cvpr-2018",
    title="Squeeze-and-Excitation Networks",
    subtitle="从通道重标定读懂 SENet 的核心机制",
    source_type="builtin",
    estimated_minutes=32,
    difficulty="进阶 · CNN",
    progress=0,
    created_at=datetime.now(UTC).isoformat(),
)

store.seed_senet(SENET_MATERIAL)

# --- Scoring (pure Python, no AI needed for SENet) ---------------------------
# We inline a minimal version of evaluate_senet so we don't depend on the
# full services/api/app/ modules (which pull in pymupdf & openai).
# The logic is identical to services/api/app/scoring.py::evaluate_senet.

def _contains(text: str, *terms: str) -> bool:
    return any(t.lower() in text.lower() for t in terms)


def _verdict(score: int, max_score: int) -> str:
    ratio = score / max_score
    if ratio >= 0.75: return "掌握"
    if ratio >= 0.4: return "部分掌握"
    return "需要回看"


def evaluate_senet(response: dict) -> dict:
    """Rule-based scoring for the three SENet comprehension questions."""
    answers: list[dict] = response.get("answers", [])
    retelling: str = response.get("retelling", "")

    q_results = []
    total_score = 0
    total_max = 11  # Q1=4, Q2=4, Q3=3

    for i, ans in enumerate(answers):
        rid = ans.get("question_id", f"q{i+1}")
        text = ans.get("response", "")

        if rid == "q1":
            score = 0
            tags: list[str] = []
            if _contains(text, "全局", "global", "整体", "摘要", "概括"):
                score += 1
            if _contains(text, "空间", "位置", "分布", "丢失", "失去"):
                score += 1
            if _contains(text, "通道", "channel", "C"):
                score += 1
            if len(text) >= 30:
                score += 1
            if score < 3 and not _contains(text, "空间"):
                tags.append("遗漏空间压缩影响")
            q_results.append(dict(
                question_id=rid, verdict=_verdict(score, 4), score=score,
                max_score=4, misconception_tags=tags,
                feedback="已根据关键词评估。原文证据见 PDF 第 3 页公式（2）。",
                source=dict(label="PDF 第 3 页", detail="公式（2）") if score < 3 else None,
            ))
            total_score += score

        elif rid == "q2":
            score = 0
            tags = []
            for shape in ["1×1×256", "1x1x256", "1*1*256", "256"]:
                if shape in text.replace(" ", ""):
                    score += 1
                    break
            if _contains(text, "16", "C/r", "C/16"):
                score += 1
            if _contains(text, "32×32×256", "32x32x256", "H×W×C"):
                score += 1
            if _contains(text, "sigmoid", "σ", "激活"):
                score += 1
            if "16" not in text and "C/r" not in text:
                tags.append("未写出瓶颈维度")
            q_results.append(dict(
                question_id=rid, verdict=_verdict(score, 4), score=score,
                max_score=4, misconception_tags=tags,
                feedback="检查各阶段形状：Squeeze → 1×1×C，FC1 → 1×1×C/r，FC2 → 1×1×C，Scale → H×W×C。",
                source=dict(label="PDF 第 3—4 页", detail="公式（3）、（4）") if score < 3 else None,
            ))
            total_score += score

        elif rid == "q3":
            score = 0
            tags = []
            if _contains(text, "B", "选项 B", "SE(residual", "non-identity", "残差分支"):
                score += 2
            elif _contains(text, "A", "选项 A"):
                score += 1
                tags.append("SE 应作用于 residual 分支")
            if _contains(text, "identity", "恒等", "shortcut", "相加", "之后", "before"):
                score += 1
            if score < 2:
                tags.append("未区分 identity 与 residual 分支")
            q_results.append(dict(
                question_id=rid, verdict=_verdict(score, 3), score=score,
                max_score=3, misconception_tags=tags,
                feedback="正确答案 B。SE 位于 non-identity branch，在相加之前。参见 Figure 3。",
                source=dict(label="PDF 第 4 页", detail="Figure 3") if score < 2 else None,
            ))
            total_score += score

        else:
            q_results.append(dict(
                question_id=rid, verdict="未评测", score=0, max_score=0,
                misconception_tags=[], feedback="",
            ))

    # Retelling
    ret_score = 0
    ret_tags: list[str] = []
    if len(retelling) >= 20:
        ret_score += 1
    if _contains(retelling, "squeeze", "压缩", "全局", "池化"):
        ret_score += 1
    if _contains(retelling, "excitation", "门控", "sigmoid", "权重", "激励"):
        ret_score += 1
    if _contains(retelling, "scale", "缩放", "重标定", "乘"):
        ret_score += 1
    if _contains(retelling, "residual", "残差", "identity", "相加", "分支"):
        ret_score += 1
    if len(retelling) < 20:
        ret_tags.append("复述过短")
    if ret_score < 3:
        ret_tags.append("遗漏关键步骤")

    ret_result = dict(score=ret_score, max_score=5, verdict=_verdict(ret_score, 5),
                      misconception_tags=ret_tags)

    mastery = round((total_score + ret_score) / (total_max + 5) * 100)
    tags = []
    for q in q_results:
        for t in q.get("misconception_tags", []):
            if t not in tags:
                tags.append(t)
    for t in ret_result.get("misconception_tags", []):
        if t not in tags:
            tags.append(t)

    headlines = {
        (80, 101): "回答准确，对 SE 三阶段与 residual 位置的理解扎实。",
        (60, 80): "核心概念有印象，但在写法位置或形状推导上可以更准。",
        (0, 60): "需要回看原文，重点在 Squeeze 的含义和 SE 的插入位置。",
    }
    headline = "本次诊断已完成。"
    for (lo, hi), h in headlines.items():
        if lo <= mastery < hi:
            headline = h
            break

    return dict(
        mastery=mastery,
        headline=headline,
        question_results=q_results,
        retelling=ret_result,
        misconception_tags=tags,
    )


# --- Pydantic request/response models ----------------------------------------
from pydantic import BaseModel, Field

class EvaluationRequest(BaseModel):
    answers: list[dict] = Field(default_factory=list)
    retelling: str = ""


class SessionCreate(BaseModel):
    material_id: str
    persona_id: str


# --- FastAPI app -------------------------------------------------------------
app = FastAPI(title=settings.app_name, version="0.0.0")

# In production on Vercel, allow the Vercel domain & local dev
origins = os.getenv("CORS_ORIGINS", "https://wenqu-reading-room.vercel.app,https://lizhuofan-curry.github.io,http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PERSONAS = [
    dict(id="huangfeng", name="黄风教练", tagline="先把结论抓住，再一个公式一个公式拆。",
         tone="直接、短句、适度调侃", accent="别急着硬啃，先把这一步看明白。"),
    dict(id="senior", name="安静师姐", tagline="不催你，陪你把卡住的地方慢慢理顺。",
         tone="温和、循序渐进、少调侃", accent="你已经抓住一部分了，我们再补上缺的条件。"),
    dict(id="researcher", name="严格研究员", tagline="术语、公式、证据和边界，一个都不能混。",
         tone="严谨、直接、证据优先", accent="这句话需要证据。请区分论文结论与推断。"),
]


@app.get("/api/health")
def health() -> dict:
    ai_configured = (
        bool(settings.deepseek_api_key) if settings.ai_provider == "deepseek"
        else bool(settings.openai_api_key)
    )
    return {
        "status": "ok",
        "version": "v.0",
        "ai_configured": ai_configured,
        "ai_provider": settings.ai_provider,
        "model": settings.deepseek_model if settings.ai_provider == "deepseek" else settings.openai_model,
    }


@app.get("/api/personas")
def list_personas():
    return PERSONAS


@app.get("/api/materials")
def list_materials():
    materials = store.list_materials()
    return [
        dict(
            id=m["id"], title=m["title"], subtitle=m["subtitle"],
            source_type=m["source_type"], estimated_minutes=m["estimated_minutes"],
            difficulty=m["difficulty"], progress=m["progress"], created_at=m["created_at"],
        )
        for m in materials
    ]


@app.get("/api/materials/{material_id}")
def get_material(material_id: str):
    m = store.get_material(material_id)
    if m is None:
        raise HTTPException(404, "材料不存在。")
    # Include questions and sections for study flow
    return dict(
        id=m["id"], title=m["title"], subtitle=m["subtitle"],
        source_type=m["source_type"], estimated_minutes=m["estimated_minutes"],
        difficulty=m["difficulty"], progress=m["progress"],
        created_at=m["created_at"],
    )


@app.post("/api/sessions", status_code=201)
def create_session(req: SessionCreate):
    m = store.get_material(req.material_id)
    if m is None:
        raise HTTPException(404, "材料不存在。")
    if not any(p["id"] == req.persona_id for p in PERSONAS):
        raise HTTPException(400, "陪读人格不存在。")
    return store.create_session(uuid.uuid4().hex, req.material_id, req.persona_id)


@app.post("/api/sessions/{session_id}/evaluate")
def evaluate_session(session_id: str, req: EvaluationRequest):
    s = store.get_session(session_id)
    if s is None:
        raise HTTPException(404, "学习会话不存在。")
    if s["status"] == "completed":
        raise HTTPException(409, "该学习会话已经完成。")
    result = evaluate_senet(dict(answers=req.answers, retelling=req.retelling))
    return store.complete_session(
        session_id,
        [dict(question_id=a.get("question_id",""), response=a.get("response","")) for a in req.answers],
        req.retelling,
        result,
    )


@app.get("/api/archive")
def archive():
    persona_by_id = {p["id"]: p["name"] for p in PERSONAS}
    items = []
    for row in store.archive_rows():
        result = json.loads(row["result_json"])
        material = store.get_material(row["material_id"])
        items.append(dict(
            session_id=row["id"],
            material_id=row["material_id"],
            material_title=(material or {}).get("title", row["material_id"]),
            persona_name=persona_by_id.get(row["persona_id"], row["persona_id"]),
            completed_at=row.get("completed_at", ""),
            mastery=result["mastery"],
            headline=result["headline"],
            misconception_tags=result["misconception_tags"],
            retelling=row.get("retelling", ""),
        ))
    return items
