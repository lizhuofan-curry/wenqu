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
        s["retelling"] = retelling
        s["result"] = result
        return s

    def archive_rows(self) -> List[dict]:
        return [s for s in self._sessions.values() if s["status"] == "completed"]


store = MemStore()

# --- Seed built-in SENet material (full content including map, sections, questions) ---
SENET_MATERIAL = dict(
    id="senet-cvpr-2018",
    title="Squeeze-and-Excitation Networks",
    subtitle="从通道重标定读懂 SENet 的核心机制",
    source_type="builtin",
    estimated_minutes=32,
    difficulty="进阶 · CNN",
    progress=0,
    created_at=datetime.now(UTC).isoformat(),
    map=[
        dict(key="problem", title="问题",
             summary="普通卷积把通道关系隐式地埋在卷积核里，网络缺少根据当前输入显式调整通道响应的机制。",
             source=dict(label="PDF 第 2—3 页", detail="第 3 节开头")),
        dict(key="method", title="方法",
             summary="先用全局平均池化压缩空间信息，再用两层门控生成 C 个通道权重，最后逐通道缩放原特征。",
             source=dict(label="PDF 第 2—3 页", detail="Figure 1；公式（2）—（4）")),
        dict(key="evidence", title="证据",
             summary="SE block 接入 ResNet、ResNeXt、VGG 和 Inception 等架构后，ImageNet 验证集错误率普遍下降。",
             source=dict(label="PDF 第 5—7 页", detail="Table 2、Table 3、Table 5、Table 6")),
        dict(key="conclusion", title="结论",
             summary="输入相关的通道重标定可以用较小计算开销增强多种 CNN 主干的表示能力。",
             source=dict(label="PDF 第 8 页", detail="第 7 节 Conclusion")),
        dict(key="limitations", title="边界",
             summary="全局平均会压缩空间分布；论文主要提供经验结果，没有给出完整理论证明，也未覆盖现代分布外鲁棒性评估。",
             source=dict(label="PDF 第 3、8 页", detail="3.1 Discussion；实验覆盖范围推断")),
    ],
    learning_goals=[
        "说明 SE 为什么是输入相关的通道重标定，而不是固定剪枝。",
        "推导 Squeeze、Excitation、Scale 各阶段的张量形状。",
        "指出 SE 在 ResNet residual 分支中的正确插入位置。",
    ],
    sections=[
        dict(id="squeeze", title="Squeeze", eyebrow="全局信息嵌入",
             strict_track="输入 U∈R^(H×W×C)。对第 c 个通道执行全局平均池化：z_c=1/(H×W)·Σ_iΣ_j u_c(i,j)。张量从 H×W×C 变为 1×1×C。每个通道保留一个全局统计值，但具体空间位置被压缩。",
             companion_track="先别被名字吓到。Squeeze 不是把通道删掉，而是给每个通道写一句摘要。原来一个通道有 H×W 个数，现在先平均成一个数，所以 C 个通道仍然都在。",
             source=dict(label="PDF 第 3 页", detail="3.1 节与公式（2）")),
        dict(id="excitation", title="Excitation", eyebrow="自适应通道门控",
             strict_track="s=σ(W₂·ReLU(W₁·z))。若 reduction ratio 为 r，维度依次为 C→C/r→C。sigmoid 为每个通道生成独立的 0—1 门控值；通道不是互斥关系，因此不是 softmax。",
             companion_track="把 C 句通道摘要放在一起判断：谁该大声一点，谁先小点声。两层全连接先压缩再恢复，最后得到 C 个音量旋钮。多个通道可以同时重要。",
             source=dict(label="PDF 第 3 页", detail="3.2 节与公式（3）")),
        dict(id="scale", title="Scale", eyebrow="逐通道重标定",
             strict_track="第 c 个输出通道为 X̃_c=s_c·u_c。标量 s_c 广播到该通道所有空间位置，因此输出形状仍为 H×W×C。权重由当前输入计算，不是训练后固定常数。",
             companion_track="现在把每个通道乘上自己的音量旋钮。形状完全不变，只是响应强弱变了。同一通道遇到不同图片时权重也会变；把它说成固定剪枝，就绕偏了。",
             source=dict(label="PDF 第 3 页", detail="公式（4）")),
        dict(id="resnet", title="接入 ResNet", eyebrow="残差分支位置",
             strict_track="SE 作用于 non-identity residual branch。先计算 residual transform，再执行 SE scale，最后与 identity branch 相加。对应表达为 output=SE(residual(x))+identity(x)。",
             companion_track="两条路别搅一锅：SE 只调 residual 那条路，调完才和 identity 会合。看 Figure 3 的箭头，位置比背公式更重要。",
             source=dict(label="PDF 第 4 页", detail="Figure 3 与 3.3 节")),
    ],
    questions=[
        dict(id="q1", kind="concept",
             prompt="为什么 Squeeze 要把每个 H×W 通道压缩成一个数？这样获得了什么，又丢失了什么？",
             hint="分别考虑全局上下文和空间位置。",
             source=dict(label="PDF 第 3 页", detail="3.1 节与公式（2）"),
             answer_guide="全局平均池化为每个通道生成利用整张特征图的全局描述；保留 C 个通道，但压缩了具体空间位置与分布信息。",
             max_score=4),
        dict(id="q2", kind="tensor",
             prompt="输入 U 的形状是 32×32×256，reduction ratio r=16。依次写出 Squeeze、第一层 FC、第二层 FC+sigmoid、Scale 后的形状。",
             hint="r 只控制中间瓶颈维度。",
             source=dict(label="PDF 第 3—4 页", detail="公式（3）、（4）与 Figure 3"),
             answer_guide="1×1×256 → 16 → 256 → 32×32×256。",
             max_score=4),
        dict(id="q3", kind="structure",
             prompt="哪种写法符合论文 Figure 3？A. SE(residual(x)+identity(x))；B. SE(residual(x))+identity(x)。请说明理由。",
             hint="观察 SE 位于哪一条分支、在相加节点之前还是之后。",
             source=dict(label="PDF 第 4 页", detail="Figure 3"),
             answer_guide="选择 B。SE 缩放 residual/non-identity branch，之后才与 identity 相加。",
             max_score=3),
    ],
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
    return m


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
        # Cold start: session was lost. Auto-create it so scoring can proceed.
        s = store.create_session(session_id, "senet-cvpr-2018", "huangfeng")
    if s["status"] == "completed":
        raise HTTPException(409, "该学习会话已经完成。")
    result = evaluate_senet(dict(answers=req.answers, retelling=req.retelling))
    return store.complete_session(
        session_id,
        [dict(question_id=a.get("question_id",""), response=a.get("response","")) for a in req.answers],
        req.retelling,
        result,
    )


# NOTE: /api/archive intentionally not implemented here.
# The frontend reads archive directly from Supabase (cloud.ts -> loadCloudArchive).
# If we returned an empty array from this in-memory store, it would shadow the
# real Supabase archive, so the frontend fallback never triggers.  Returning 404
# lets the frontend's withDemo catch the error and fall back to Supabase/local.

