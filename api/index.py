"""Vercel serverless entry point for the wenqu API.

When deployed to Vercel, every request matching /api/* is routed here.
The FastAPI app is mounted as an ASGI application.
"""

from __future__ import annotations

import base64
import json
import hashlib
import hmac
import logging
import os
import re
import sys
import time
import uuid
import urllib.error as _urlerror
import urllib.parse as _urlparse
import urllib.request as _urllib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Dict, List

# Vercel adds <project-root>/api to sys.path.  Add <project-root> so we can
# import from services/api/app.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from fastapi import FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path as FilePath
from pydantic import BaseModel, Field

from api.diagnostic_routes import register_diagnostic_routes
from api.transfer_core import material_rubric_fingerprint
from api.transfer_routes import register_transfer_routes

logger = logging.getLogger(__name__)

# --- Supabase REST helper (raw HTTP) ------------------------------------------
_supa_url = (os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).strip().strip('"')
_supa_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"')
_archive_retry_secret = os.getenv("ARCHIVE_RETRY_SECRET", "").strip().strip('"')
_supa_auth_key = (
    os.getenv("SUPABASE_ANON_KEY", "")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    or _supa_service_key
).strip().strip('"')


def _supa_ok():
    return bool(_supa_url and _supa_service_key)


def _service_headers() -> dict[str, str]:
    return {"apikey": _supa_service_key, "Authorization": f"Bearer {_supa_service_key}"}


def _supa_get(path: str):
    req = _urllib.Request(
        f"{_supa_url}/rest/v1/{path}",
        headers=_service_headers(),
    )
    with _urllib.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _supa_up(table: str, body: dict):
    data = json.dumps(body).encode("utf-8")
    req = _urllib.Request(
        f"{_supa_url}/rest/v1/{table}?on_conflict=id",
        data=data,
        headers={
            **_service_headers(),
            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates",
        },
        method="POST",
    )
    with _urllib.urlopen(req, timeout=10):
        pass


def _supa_up_study_record(body: dict):
    data = json.dumps(body).encode("utf-8")
    req = _urllib.Request(
        f"{_supa_url}/rest/v1/study_records?on_conflict=session_id,user_id",
        data=data,
        headers={
            **_service_headers(),
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates",
        },
        method="POST",
    )
    with _urllib.urlopen(req, timeout=10):
        pass

def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

def _archive_retry_key() -> bytes | None:
    key = _archive_retry_secret.encode("utf-8")
    return key if len(key) >= 32 else None



def _sign_archive_retry(record: dict) -> str | None:
    """Return a tamper-evident browser receipt for one server-owned record."""
    key = _archive_retry_key()
    if key is None:
        return None
    payload = {
        "version": 1,
        "issued_at": datetime.now(UTC).isoformat(),
        "record": record,
    }
    encoded = _base64url_encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    signature = _base64url_encode(
        hmac.new(
            key,
            encoded.encode("ascii"),
            hashlib.sha256,
        ).digest()
    )
    return f"{encoded}.{signature}"


def _verify_archive_retry(receipt: str) -> dict:
    key = _archive_retry_key()
    if key is None:
        raise HTTPException(
            503,
            "云端恢复服务配置无效：ARCHIVE_RETRY_SECRET 必须至少包含 32 个 UTF-8 字节。",
        )
    try:
        encoded, signature = receipt.split(".", 1)
        expected = _base64url_encode(
            hmac.new(
                key,
                encoded.encode("ascii"),
                hashlib.sha256,
            ).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature mismatch")
        payload = json.loads(_base64url_decode(encoded).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("invalid payload")
        if payload.get("version") != 1:
            raise ValueError("invalid version")
        issued_at = datetime.fromisoformat(payload["issued_at"])
        if issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=UTC)
        now = datetime.now(UTC)
        if issued_at > now + timedelta(minutes=5):
            raise HTTPException(422, "云端恢复凭据的签发时间无效。")
        if now - issued_at > timedelta(days=90):
            raise HTTPException(410, "这条恢复凭据已超过 90 天，请保留本地备份并联系维护者。")
        record = payload["record"]
        if not isinstance(record, dict):
            raise ValueError("invalid payload")
        if not isinstance(record.get("session_id"), str) or not isinstance(
            record.get("user_id"),
            str,
        ):
            raise ValueError("invalid record")
        return record
    except HTTPException:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as exc:
        raise HTTPException(422, "云端恢复凭据无效或已被修改。") from exc


def _supa_del(table: str, mid: str, user_id: str):
    encoded_mid = _urlparse.quote(mid, safe="")
    encoded_user = _urlparse.quote(user_id, safe="")
    req = _urllib.Request(
        f"{_supa_url}/rest/v1/{table}?id=eq.{encoded_mid}&user_id=eq.{encoded_user}",
        headers=_service_headers(),
        method="DELETE",
    )
    with _urllib.urlopen(req, timeout=10):
        pass


def _supa_rpc(function_name: str, body: dict):
    data = json.dumps(body).encode("utf-8")
    req = _urllib.Request(
        f"{_supa_url}/rest/v1/rpc/{function_name}",
        data=data,
        headers={**_service_headers(), "Content-Type": "application/json"},
        method="POST",
    )
    with _urllib.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else None


def _verify_access_token(token: str) -> str | None:
    """Return the Supabase user id for a bearer token, or None when invalid."""
    if not (_supa_url and _supa_auth_key and token):
        return None
    req = _urllib.Request(
        f"{_supa_url}/auth/v1/user",
        headers={"apikey": _supa_auth_key, "Authorization": f"Bearer {token}"},
    )
    try:
        with _urllib.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (_urlerror.HTTPError, _urlerror.URLError, TimeoutError, ValueError):
        return None
    user_id = payload.get("id") if isinstance(payload, dict) else None
    return user_id if isinstance(user_id, str) and user_id else None


def _auth_user(authorization: str | None, *, required: bool) -> str | None:
    if not authorization:
        if required:
            raise HTTPException(401, "请先登录。", headers={"WWW-Authenticate": "Bearer"})
        return None
    scheme, separator, token = authorization.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "登录凭据无效。", headers={"WWW-Authenticate": "Bearer"})
    user_id = _verify_access_token(token.strip())
    if not user_id:
        raise HTTPException(401, "登录凭据无效或已过期。", headers={"WWW-Authenticate": "Bearer"})
    return user_id


def _consume_ai_quota(user_id: str, action: str) -> bool:
    """Atomically consume one daily AI action through a service-role-only RPC."""
    if not _supa_ok():
        return False
    try:
        return _supa_rpc("consume_ai_quota", {"p_user_id": user_id, "p_action": action}) is True
    except Exception as exc:
        logger.warning("ai_quota_check_failed action=%s error=%s", action, type(exc).__name__)
        return False


def _require_ai_quota(user_id: str, action: str) -> None:
    if not _consume_ai_quota(user_id, action):
        raise HTTPException(429, "今日 AI 使用额度已用完，请明天再试。")


def _load_supa_materials(user_id: str):
    """Load only one authenticated user's materials into the shared process."""
    if not _supa_ok():
        return
    try:
        encoded_user = _urlparse.quote(user_id, safe="")
        rows = _supa_get(
            f"materials?select=payload_json,user_id&user_id=eq.{encoded_user}&order=created_at.asc"
        )
        for row in (rows or []):
            p = row.get("payload_json")
            row_owner = row.get("user_id")
            if (
                p
                and isinstance(p, dict)
                and p.get("id") != "senet-cvpr-2018"
                and row_owner == user_id
            ):
                p["_owner_id"] = user_id
                store.seed_senet(p)
    except Exception as exc:
        logger.warning("material_restore_failed error=%s", type(exc).__name__)

# --- Config -------------------------------------------------------------------
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
        self._chunks: Dict[str, list[dict]] = {}  # material_id -> [{text, embedding}]

    def seed_senet(self, senet: dict):
        material_id = senet["id"]
        if material_id == "senet-cvpr-2018" and material_id in self._materials:
            return
        self._materials[material_id] = senet

    def set_chunks(self, material_id: str, chunks: list[dict]):
        self._chunks[material_id] = chunks

    def get_chunks(self, material_id: str, user_id: str | None) -> list[dict]:
        if self.get_material(material_id, user_id) is None:
            return []
        return self._chunks.get(material_id, [])

    def list_materials(self, user_id: str | None) -> List[dict]:
        return [
            material for material in self._materials.values()
            if material.get("id") == "senet-cvpr-2018"
            or (user_id is not None and material.get("_owner_id") == user_id)
        ]

    def get_material(self, mid: str, user_id: str | None) -> dict | None:
        material = self._materials.get(mid)
        if material is None:
            return None
        if mid == "senet-cvpr-2018" or material.get("_owner_id") == user_id:
            return material
        return None

    def delete_material(self, mid: str, user_id: str) -> bool:
        if self.get_material(mid, user_id) is None:
            return False
        self._materials.pop(mid, None)
        self._chunks.pop(mid, None)
        return True

    def create_session(self, sid: str, mid: str, pid: str, user_id: str | None) -> dict:
        s = {
            "id": sid, "material_id": mid, "persona_id": pid,
            "status": "active", "started_at": datetime.now(UTC).isoformat(),
            "_owner_id": user_id,
        }
        self._sessions[sid] = s
        return s

    def get_session(self, sid: str, user_id: str | None) -> dict | None:
        session = self._sessions.get(sid)
        if session is not None and session.get("_owner_id") == user_id:
            return session
        return None

    def has_session(self, sid: str) -> bool:
        return sid in self._sessions

    def complete_session(self, sid: str, answers: list, retelling: str, result: dict) -> dict:
        s = self._sessions[sid]
        s["status"] = "completed"
        s["completed_at"] = datetime.now(UTC).isoformat()
        s["retelling"] = retelling
        s["result"] = result
        return s

    def archive_rows(self, user_id: str) -> List[dict]:
        return [
            s for s in self._sessions.values()
            if s["status"] == "completed" and s.get("_owner_id") == user_id
        ]


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

# Pre-chunk SENet for faster AI evaluation (built once per cold start)
def _seed_senet_chunks():
    text = ""
    for s in SENET_MATERIAL.get("sections", []):
        text += s.get("strict_track", "") + "\n" + s.get("companion_track", "") + "\n"
    try:
        chunks = _chunk_text(text)
        if chunks:
            import asyncio
            loop = asyncio.new_event_loop()
            embeddings = loop.run_until_complete(_embed_texts(chunks))
            loop.close()
            store.set_chunks("senet-cvpr-2018", [
                {"text": c, "embedding": e}
                for c, e in zip(chunks, embeddings)
            ])
    except Exception:
        pass

if bool(os.getenv("DEEPSEEK_API_KEY")):
    _seed_senet_chunks()

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


# --- AI-powered evaluation (DeepSeek) ------------------------------------------

# Lightweight response schemas for structured JSON output
class AIQuestionResult(BaseModel):
    question_id: str
    score: int = Field(ge=0)
    max_score: int = Field(ge=0)
    verdict: str  # "掌握" | "部分掌握" | "需要回看"
    feedback: str
    misconception_tags: list[str] = Field(default_factory=list)


class AIRetellingResult(BaseModel):
    score: int = Field(ge=0)
    max_score: int = Field(ge=0)
    feedback: str
    misconception_tags: list[str] = Field(default_factory=list)


class AIEvaluationResult(BaseModel):
    mastery: int = Field(ge=0, le=100)
    headline: str
    question_results: list[AIQuestionResult]
    retelling: AIRetellingResult
    misconception_tags: list[str]


# --- RAG: chunking, embedding, retrieval ---------------------------------------

def _chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    """Split text into overlapping chunks at sentence boundaries."""
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:].strip())
            break
        # Try to break at sentence boundary within the overlap zone
        cut = end
        for sep in ["\n\n", "\n", "。", "；", ". ", " "]:
            pos = text.rfind(sep, end - overlap, end)
            if pos > start:
                cut = pos + len(sep)
                break
        chunks.append(text[start:cut].strip())
        start = cut - overlap if cut - overlap > start else cut
    return [c for c in chunks if len(c) > 20]


async def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Get embeddings from DeepSeek API."""
    from openai import OpenAI
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key:
        return []
    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        timeout=10.0,
    )
    resp = client.embeddings.create(
        model="deepseek-embedding",  # or text-embedding-ada-002 compatible
        input=texts,
    )
    return [d.embedding for d in resp.data]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def _retrieve_chunks(
    query_embedding: list[float],
    chunks: list[dict],
    top_k: int = 4,
) -> list[str]:
    """Return top-k most relevant chunk texts by cosine similarity."""
    if not query_embedding or not chunks:
        return []
    scored = [
        (chunk["text"], _cosine_similarity(query_embedding, chunk["embedding"]))
        for chunk in chunks
        if chunk.get("embedding")
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [text for text, _ in scored[:top_k]]


def _select_source_chunks(query: str, chunks: list[dict], top_k: int = 4) -> list[str]:
    """Choose useful source excerpts locally, without a second provider request.

    Upload and evaluation must each finish within one DeepSeek request on the
    serverless path.  The source excerpts still ground the evaluator, while
    avoiding an optional embedding call that could consume the whole request
    budget before scoring begins.
    """
    texts = [chunk.get("text", "") for chunk in chunks if chunk.get("text")]
    if not texts:
        return []
    chinese_runs = re.findall(r"[\u4e00-\u9fff]{2,}", query)
    chinese_bigrams = {
        run[index:index + 2]
        for run in chinese_runs
        for index in range(len(run) - 1)
    }
    english_terms = set(re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", query.lower()))
    terms = chinese_bigrams | english_terms
    if not terms:
        return texts[:top_k]
    ranked = sorted(
        texts,
        key=lambda text: sum(term in text.lower() for term in terms),
        reverse=True,
    )
    return ranked[:top_k]


async def evaluate_with_deepseek(
    questions: list[dict],
    answers: list[dict],
    retelling: str,
    material_chunks: list[dict] | None = None,
    material_title: str = "",
) -> dict:
    """Call DeepSeek to evaluate answers, using RAG-retrieved context if available."""
    from openai import OpenAI

    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not configured")

    # Leave room below Vercel's function limit for request parsing and response
    # serialization.  Do not add an embeddings call ahead of this request.
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=7.0, max_retries=0)

    # Build questions context
    question_context = []
    for q in questions:
        question_context.append(dict(
            id=q["id"],
            prompt=q["prompt"],
            rubric=q.get("answer_guide", ""),
            max_score=q.get("max_score", 4),
        ))

    # Select source evidence locally.  Calling an embedding endpoint here made
    # one scoring action wait for two sequential remote requests.
    user_text = " ".join(a.get("response", "") for a in answers) + " " + retelling
    rag_context = ""
    if material_chunks:
        relevant = _select_source_chunks(user_text, material_chunks, top_k=4)
        if relevant:
            rag_context = "\n\n相关原文片段：\n" + "\n---\n".join(relevant)

    prompt = {
        "task": ("作为问渠诊断器，根据评分依据和提供的原文片段评估学习者的回答和复述。用中文。"
                 if rag_context else "作为问渠诊断器，根据评分依据评估学习者的回答和复述。用中文。"),
        "material": material_title,
        "questions": question_context,
        "answers": [{"question_id": a.get("question_id",""), "response": a.get("response","")} for a in answers],
        "retelling": retelling,
    }
    if rag_context:
        prompt["source_excerpts"] = rag_context

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": (
                "你是严格但善意的学习诊断器。只输出合法 JSON，不用 Markdown 代码块。"
                "返回 mastery (0-100 整数)、headline (中文一句总结)、"
                "question_results (每道题 score/verdict/feedback/misconception_tags)、"
                "retelling (score/feedback/misconception_tags)、misconception_tags。"
                "反馈中引用原文证据时标注页码或段落。"
            )},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
        max_tokens=900,
    )

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("DeepSeek returned empty response")

    parsed = AIEvaluationResult.model_validate_json(content)

    return dict(
        mastery=parsed.mastery,
        headline=parsed.headline,
        question_results=[qr.model_dump() for qr in parsed.question_results],
        retelling=parsed.retelling.model_dump() | {"misconception_tags": parsed.retelling.misconception_tags},
        misconception_tags=parsed.misconception_tags,
    )


# --- Pydantic request/response models ----------------------------------------

class AnswerSubmission(BaseModel):
    question_id: str = Field(min_length=2, max_length=2, pattern=r"^q[123]$")
    response: str = Field(min_length=1, max_length=4000)


class QuestionReference(BaseModel):
    id: str = Field(min_length=2, max_length=2, pattern=r"^q[123]$")


class EvaluationRequest(BaseModel):
    answers: list[AnswerSubmission] = Field(min_length=3, max_length=3)
    retelling: str = Field(min_length=1, max_length=6000)
    material_id: str = Field(
        default="senet-cvpr-2018",
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    persona_id: str = Field(default="huangfeng", min_length=1, max_length=64)
    questions: list[QuestionReference] = Field(default_factory=list, max_length=3)
    expected_user_id: str | None = Field(default=None, min_length=1, max_length=64)
    review_source_session_id: str | None = Field(default=None, min_length=1, max_length=128)
    review_interval_days: int | None = Field(default=None)


class ArchiveRetryRequest(BaseModel):
    retry_token: str = Field(min_length=20, max_length=100_000)
    expected_user_id: str = Field(min_length=1, max_length=64)


def _parse_server_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def _validated_review_link(
    req: EvaluationRequest, user_id: str | None, material: dict, session_id: str
) -> dict | None:
    has_review_source = req.review_source_session_id is not None
    has_review_interval = req.review_interval_days is not None
    if user_id is None:
        if req.expected_user_id is not None or has_review_source or has_review_interval:
            raise HTTPException(422, "匿名学习不能提交云端账号或复习来源。")
        return None
    if req.expected_user_id != user_id:
        raise HTTPException(409, "登录账号状态不一致，本次记录不会归入当前账号。")
    if has_review_source != has_review_interval:
        raise HTTPException(422, "复习来源与间隔必须同时提供。")
    if not has_review_source:
        return None
    if req.review_interval_days not in (1, 3, 7):
        raise HTTPException(422, "复习间隔只能是 1、3 或 7 天。")
    if req.review_source_session_id == session_id:
        raise HTTPException(422, "复习记录不能引用自身。")
    if not _supa_ok():
        raise HTTPException(503, "云端复习来源暂时不可验证，本次不会生成保持率记录。")

    encoded_source = _urlparse.quote(req.review_source_session_id or "", safe="")
    encoded_user = _urlparse.quote(user_id, safe="")
    try:
        source_rows = _supa_get(
            "study_records?select=session_id,material_id,completed_at,"
            "server_verified_at,session_data"
            f"&session_id=eq.{encoded_source}&user_id=eq.{encoded_user}&limit=1"
        )
        prior_rows = _supa_get(
            "study_records?select=session_id,session_data"
            f"&user_id=eq.{encoded_user}"
            f"&session_data->review->>source_session_id=eq.{encoded_source}"
        )
    except Exception as exc:
        logger.warning("review_source_check_failed error=%s", type(exc).__name__)
        raise HTTPException(502, "云端复习来源校验失败。") from exc

    material_id = str(material.get("id", ""))
    if not source_rows or source_rows[0].get("material_id") != material_id:
        raise HTTPException(422, "复习来源记录不存在、材料不一致或不属于当前账号。")
    source = source_rows[0]
    source_data = source.get("session_data")
    if (
        not source.get("server_verified_at")
        or not isinstance(source_data, dict)
        or source_data.get("review") is not None
        or source_data.get("transfer") is not None
    ):
        raise HTTPException(422, "复习来源不是可信的原始学习基线。")

    current_fingerprint = material_rubric_fingerprint(material)
    source_fingerprint = source_data.get("rubric_fingerprint")
    if source_fingerprint != current_fingerprint:
        raise HTTPException(409, "材料或评分规则已经变化，旧基线不能继续比较。")
    source_completed = _parse_server_datetime(source.get("completed_at"))
    if source_completed is None:
        raise HTTPException(422, "复习来源缺少可信的完成时间。")

    interval_days = int(req.review_interval_days)
    due_at = source_completed + timedelta(days=interval_days)
    checked_at = datetime.now(UTC)
    if checked_at < due_at:
        raise HTTPException(425, "这次延迟复测尚未到期，请在计划时间后再提交。")

    prior_intervals: set[int] = set()
    for row in prior_rows if isinstance(prior_rows, list) else []:
        row_data = row.get("session_data")
        link = row_data.get("review") if isinstance(row_data, dict) else None
        if (
            isinstance(link, dict)
            and link.get("source_session_id") == req.review_source_session_id
            and link.get("measurement_version") == 1
            and link.get("interval_days") in (1, 3, 7)
        ):
            prior_intervals.add(int(link["interval_days"]))
    if interval_days in prior_intervals:
        raise HTTPException(409, "这个来源的同一复习间隔已经完成，不能重复计入。")

    return {
        "source_session_id": req.review_source_session_id,
        "interval_days": interval_days,
        "source_completed_at": source_completed.isoformat(),
        "due_at": due_at.isoformat(),
        "source_rubric_fingerprint": source_fingerprint,
        "measurement_version": 1,
        "prior_completed_intervals": sorted(prior_intervals),
    }


def _finalize_review_link(review_link: dict | None, completed_at: str) -> dict | None:
    if review_link is None:
        return None
    source_completed = _parse_server_datetime(review_link.get("source_completed_at"))
    due_at = _parse_server_datetime(review_link.get("due_at"))
    review_completed = _parse_server_datetime(completed_at)
    if source_completed is None or due_at is None or review_completed is None:
        raise HTTPException(500, "服务端无法生成可信复习时间记录。")
    finalized = dict(review_link)
    finalized["review_completed_at"] = review_completed.isoformat()
    finalized["actual_delay_seconds"] = int(
        (review_completed - source_completed).total_seconds()
    )
    finalized["timing_status"] = (
        "on_time"
        if review_completed <= due_at + timedelta(days=1)
        else "late"
    )
    return finalized


def _claim_review_measurement(
    review_link: dict | None,
    user_id: str | None,
    session_id: str,
) -> None:
    if review_link is None:
        return
    if user_id is None:
        raise HTTPException(422, "匿名学习不能认领可信复习测量。")
    try:
        claimed = _supa_rpc(
            "claim_retention_measurement",
            {
                "p_user_id": user_id,
                "p_source_session_id": review_link["source_session_id"],
                "p_interval_days": review_link["interval_days"],
                "p_session_id": session_id,
            },
        )
    except Exception as exc:
        logger.warning("review_measurement_claim_failed error=%s", type(exc).__name__)
        raise HTTPException(502, "云端复习测量认领失败，本次尚未评分。") from exc
    if claimed is not True:
        raise HTTPException(409, "这个来源的同一复习间隔已被其他会话认领。")




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

@app.middleware("http")
async def add_api_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    )
    return response


PERSONAS = [
    dict(id="huangfeng", name="黄风教练", tagline="先把结论抓住，再一个公式一个公式拆。",
         tone="直接、短句、适度调侃", accent="别急着硬啃，先把这一步看明白。"),
    dict(id="senior", name="安静师姐", tagline="不催你，陪你把卡住的地方慢慢理顺。",
         tone="温和、循序渐进、少调侃", accent="你已经抓住一部分了，我们再补上缺的条件。"),
    dict(id="researcher", name="严格研究员", tagline="术语、公式、证据和边界，一个都不能混。",
         tone="严谨、直接、证据优先", accent="这句话需要证据。请区分论文结论与推断。"),
]


_PRIVATE_MATERIAL_KEYS = {"answer_guide", "max_score", "_hash", "_owner_id"}


def _public_material(value):
    if isinstance(value, dict):
        return {
            key: _public_material(item)
            for key, item in value.items()
            if key not in _PRIVATE_MATERIAL_KEYS
        }
    if isinstance(value, list):
        return [_public_material(item) for item in value]
    return value


def _public_session(session: dict) -> dict:
    return {key: value for key, value in session.items() if not key.startswith("_")}


def _get_material_for_user(material_id: str, user_id: str | None) -> dict | None:
    material = store.get_material(material_id, user_id)
    if material is None and user_id is not None and _supa_ok():
        _load_supa_materials(user_id)
        material = store.get_material(material_id, user_id)
    return material


def _validate_question_ids(submitted_ids: list[str], questions: list[dict]) -> None:
    expected_ids = [str(question.get("id", "")) for question in questions]
    required_ids = {"q1", "q2", "q3"}
    if len(expected_ids) != 3 or set(expected_ids) != required_ids:
        raise HTTPException(500, "材料题目配置无效。")
    if (
        len(submitted_ids) != 3
        or set(submitted_ids) != required_ids
        or set(submitted_ids) != set(expected_ids)
    ):
        raise HTTPException(422, "必须提交材料中的 3 道不同题目，题号不得修改。")


def _bounded_int(value, minimum: int, maximum: int, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def _safe_tags(value) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for tag in value[:20]:
        if isinstance(tag, str) and tag.strip():
            clean = tag.strip()[:80]
            if clean not in result:
                result.append(clean)
    return result


def _normalize_evaluation_result(result: dict, questions: list[dict]) -> dict:
    """Make provider output complete, material-bound, and mathematically bounded."""
    expected = []
    for question in questions:
        qid = str(question.get("id", ""))
        max_score = _bounded_int(question.get("max_score"), 1, 20, 4)
        expected.append((qid, max_score, question.get("source")))

    raw_rows = result.get("question_results", []) if isinstance(result, dict) else []
    raw_by_id = {}
    if isinstance(raw_rows, list):
        for row in raw_rows:
            if isinstance(row, dict) and row.get("question_id") not in raw_by_id:
                raw_by_id[row.get("question_id")] = row

    normalized_rows = []
    total_score = 0
    total_max = 0
    all_tags: list[str] = []
    for qid, max_score, question_source in expected:
        raw = raw_by_id.get(qid, {})
        score = _bounded_int(raw.get("score"), 0, max_score, 0)
        tags = _safe_tags(raw.get("misconception_tags"))
        normalized = {
            "question_id": qid,
            "score": score,
            "max_score": max_score,
            "verdict": _verdict(score, max_score),
            "feedback": str(raw.get("feedback", ""))[:2000],
            "misconception_tags": tags,
        }
        source = raw.get("source") if isinstance(raw.get("source"), dict) else question_source
        if isinstance(source, dict):
            detail = str(source.get("detail") or "")[:500]
            normalized["source"] = {
                "label": str(source.get("label") or "原文证据")[:500],
                "detail": detail or None,
            }
        else:
            normalized["source"] = {"label": "原文证据", "detail": None}
        normalized_rows.append(normalized)
        total_score += score
        total_max += max_score
        for tag in tags:
            if tag not in all_tags:
                all_tags.append(tag)

    raw_retelling = result.get("retelling", {}) if isinstance(result, dict) else {}
    if not isinstance(raw_retelling, dict):
        raw_retelling = {}
    retelling_score = _bounded_int(raw_retelling.get("score"), 0, 5, 0)
    retelling_tags = _safe_tags(raw_retelling.get("misconception_tags"))
    for tag in retelling_tags:
        if tag not in all_tags:
            all_tags.append(tag)
    denominator = total_max + 5
    mastery = round((total_score + retelling_score) / denominator * 100) if denominator else 0
    mastery = _bounded_int(mastery, 0, 100, 0)
    headline = str(result.get("headline", "本次诊断已完成。"))[:500]
    return {
        "total_score": total_score + retelling_score,
        "max_score": denominator,
        "mastery": mastery,
        "headline": headline,
        "summary": str(result.get("summary", headline))[:2000],
        "question_results": normalized_rows,
        "retelling": {
            "score": retelling_score,
            "max_score": 5,
            "verdict": _verdict(retelling_score, 5),
            "feedback": str(raw_retelling.get("feedback", ""))[:2000],
            "misconception_tags": retelling_tags,
        },
        "misconception_tags": all_tags,
        "review_sources": [],
        "next_step": "回看材料中对应证据后再答一次。" if mastery < 60 else "继续用自己的话复述，并核对原文证据。",
    }


@app.get("/api/health")
def health() -> dict:
    ai_configured = (
        bool(settings.deepseek_api_key) if settings.ai_provider == "deepseek"
        else bool(settings.openai_api_key)
    )
    return {
        "status": "ok",
        "version": "v.4",
        "ai_configured": ai_configured,
        "archive_retry_configured": _archive_retry_key() is not None,
        "ai_provider": settings.ai_provider,
        "model": settings.deepseek_model if settings.ai_provider == "deepseek" else settings.openai_model,
    }


@app.get("/api/personas")
def list_personas():
    return PERSONAS


@app.get("/api/materials")
def list_materials(authorization: str | None = Header(default=None, alias="Authorization")):
    user_id = _auth_user(authorization, required=False)
    if user_id is not None and _supa_ok():
        _load_supa_materials(user_id)
    materials = store.list_materials(user_id)
    return [
        dict(
            id=m["id"], title=m["title"], subtitle=m["subtitle"],
            source_type=m["source_type"], estimated_minutes=m["estimated_minutes"],
            difficulty=m["difficulty"], progress=m["progress"], created_at=m["created_at"],
        )
        for m in materials
    ]


@app.get("/api/materials/{material_id}")
def get_material(
    material_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    user_id = _auth_user(authorization, required=material_id != "senet-cvpr-2018")
    material = _get_material_for_user(material_id, user_id)
    if material is None:
        raise HTTPException(404, "材料不存在。")
    return _public_material(material)


# --- Upload & AI material generation ------------------------------------------

def _extract_text(filename: str, content: bytes) -> str:
    """Extract text from PDF or Markdown. Falls back gracefully."""
    suffix = FilePath(filename).suffix.lower()
    if suffix in {".md", ".markdown"}:
        try:
            return content.decode("utf-8")[:60000]
        except UnicodeDecodeError:
            raise HTTPException(400, "Markdown 文件必须使用 UTF-8 编码。")

    if suffix == ".pdf":
        # Try pymupdf first
        try:
            import pymupdf
            doc = pymupdf.open(stream=content, filetype="pdf")
            if doc.page_count > 30:
                raise HTTPException(400, "暂不支持超过 30 页的 PDF。")
            pages = []
            for i, page in enumerate(doc):
                pages.append(f"\n[第 {i+1} 页]\n{page.get_text('text')}")
            text = "".join(pages).strip()
            if len(text) < 200:
                raise HTTPException(400, "没有提取到足够文字，可能为扫描版 PDF，暂不支持 OCR。")
            return text[:60000]
        except ImportError:
            # Fallback: try basic extraction
            try:
                decoded = content.decode("latin-1", errors="ignore")
                text_parts = []
                for chunk in decoded.split("BT"):
                    if "Tj" in chunk or "TJ" in chunk:
                        text_parts.append(chunk)
                if text_parts:
                    return "\n".join(text_parts)[:60000]
            except Exception:
                pass
            raise HTTPException(400, "PDF 文本提取失败，建议先转换为 Markdown 格式上传。")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, "PDF 文件无法解析或结构已损坏。") from exc

    raise HTTPException(400, "只支持 PDF、.md 和 .markdown 文件。")


class MaterialGeneratePayload(BaseModel):
    title: str
    subtitle: str
    estimated_minutes: int
    difficulty: str
    map: list[dict]
    learning_goals: list[str]
    sections: list[dict]
    questions: list[dict]


async def _generate_material_via_ai(filename: str, text: str) -> dict:
    """Call DeepSeek to generate learning material. Fast-optimised for Vercel 10s limit."""
    from openai import OpenAI

    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise HTTPException(400, "DeepSeek API 未配置，暂无法解析新材料。")

    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        timeout=8.0,
        max_retries=0,
    )
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    prompt = f"文件: {filename}\n\n内容摘要:\n{text[:2000]}\n\n生成学习包 JSON: title(标题), subtitle(副标题), estimated_minutes, difficulty, map(5节点 problem/method/evidence/conclusion/limitations), learning_goals(3个), sections(3-4个, 每段含id/title/eyebrow/strict_track/companion_track/source), questions(3道, 每道含id/kind/prompt/hint/source/answer_guide/max_score)。只输出JSON，不用markdown。用中文。"

    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=2000,
    )

    raw = resp.choices[0].message.content
    if not raw:
        raise HTTPException(502, "AI 没有返回内容，请重试。")

    parsed = MaterialGeneratePayload.model_validate_json(raw)
    return parsed.model_dump()




async def _ai_generate(filename: str, source_text: str) -> dict:
    """Generate Chinese translation + material-specific questions via DeepSeek.
    Runs both in a single API call to save time under Vercel's 10s limit."""
    from openai import OpenAI
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key:
        return {}
    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        timeout=7.0, max_retries=0,
    )
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

    # Trim text for the API call
    excerpt = source_text[:3000]
    prompt = json.dumps({
        "task": "根据以下英文学术材料生成中文翻译和针对性理解题。",
        "text": excerpt,
        "requirements": {
            "sections_translation": "将原文拆为2-3段，每段给出中文翻译（companion_track），保留原文（strict_track）",
            "questions": "生成3道中文理解题，针对材料的具体内容，不是通用模板。每道含id(q1/q2/q3)/kind(concept/method/evidence)/prompt/hint/source/answer_guide/max_score。用材料中的术语、公式和具体概念",
            "map_summaries": "为5个地图节点(problem/method/evidence/conclusion/limitations)各生成一个中文摘要，基于材料实际内容"
        }
    }, ensure_ascii=False)

    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是学术材料处理引擎。只输出合法JSON，不用markdown代码块。所有文本用中文。"},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        # This package has a fixed small shape.  Limiting output keeps the
        # request inside the serverless budget and makes new questions appear
        # promptly instead of timing out after a large free-form response.
        max_tokens=1100,
    )
    raw = resp.choices[0].message.content
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


@app.post("/api/materials/upload", status_code=201)
async def upload_material(
    file: UploadFile,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    """Upload with dedup + text extraction + AI translation & smart questions."""
    user_id = _auth_user(authorization, required=True)
    assert user_id is not None

    mid = f"upload-{uuid.uuid4().hex[:12]}"
    filename = (file.filename or "untitled")
    title = FilePath(filename).stem
    suffix = FilePath(filename).suffix.lower()
    allowed_types = {
        ".md": {"text/markdown", "text/plain"},
        ".markdown": {"text/markdown", "text/plain"},
        ".pdf": {"application/pdf"},
    }
    if suffix not in allowed_types:
        raise HTTPException(400, "只支持 PDF、.md 和 .markdown 文件。")
    content_type = (file.content_type or "").lower().split(";", 1)[0].strip()
    if content_type not in allowed_types[suffix]:
        raise HTTPException(400, "文件类型与扩展名不匹配。")
    source_type = "pdf" if suffix == ".pdf" else "markdown"

    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "文件不能超过 10 MB。")
    if not content:
        raise HTTPException(400, "文件不能为空。")
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(400, "PDF 文件签名无效。")

    # --- Duplicate detection (SHA-256 hash of first 1 MB) -----------------
    content_hash = hashlib.sha256(content[:1024*1024]).hexdigest()
    for m in store.list_materials(user_id):
        if m.get("_hash") == content_hash and m.get("source_type") == source_type:
            raise HTTPException(409, f"文件已存在：{m.get('title','')}")

    # --- Text extraction --------------------------------------------------
    source_text = _extract_text(filename, content)

    # --- AI generation (non-blocking — if it fails, material still works) ---
    ai_data = {}
    generation = {"status": "fallback", "message": "已先生成原文学习流；AI 题目与陪读内容尚未生成。"}
    has_ai = bool(os.getenv("DEEPSEEK_API_KEY"))
    if has_ai and source_text and len(source_text) > 100:
        _require_ai_quota(user_id, "upload")
        started_at = time.monotonic()
        try:
            ai_data = await _ai_generate(filename, source_text)
            if ai_data:
                generation = {"status": "ready", "message": "AI 已生成针对性题目与陪读内容。"}
            else:
                generation = {"status": "fallback", "message": "AI 未返回可用内容；可在资料库重新生成。"}
        except Exception as exc:
            logger.warning("upload_ai_generation_failed filename=%s error=%s", filename, type(exc).__name__)
            generation = {"status": "fallback", "message": "AI 生成暂时不可用；可在资料库重新生成。"}
        finally:
            logger.info("upload_ai_generation_finished filename=%s elapsed_ms=%d status=%s", filename, int((time.monotonic() - started_at) * 1000), generation["status"])

    # --- Sections (translated if AI succeeded) ----------------------------
    text_len = len(source_text)
    sections = []
    ai_sections = (ai_data.get("sections_translation") or []) if ai_data else []

    if ai_sections and isinstance(ai_sections, list) and len(ai_sections) >= 2:
        for i, s in enumerate(ai_sections[:3]):
            sections.append(dict(
                id=f"s{i+1}",
                title=s.get("title", f"第{i+1}部分"),
                eyebrow=f"{filename} · 第{i+1}部分",
                strict_track=s.get("strict_track", source_text[:3000])[:3000],
                companion_track=s.get("companion_track", "")[:2000],
                source=dict(label="上传文件"),
            ))
    else:
        # Fallback: raw text split
        text_preview = source_text[:8000] if source_text else ""
        parts = []
        if text_len > 2000:
            for sep in ["Introduction", "引言", "\n\n\n", "\n\n"]:
                chunks = [c.strip() for c in text_preview.split(sep) if len(c.strip()) > 100]
                if len(chunks) >= 2:
                    parts = chunks[:3]
                    break
            if len(parts) < 2:
                third = max(len(text_preview) // 3, 500)
                parts = [text_preview[:third], text_preview[third:third*2], text_preview[third*2:]]
        elif text_preview.strip():
            # Short but valid materials still need a readable dual-track
            # section; otherwise the UI reaches an empty study page.
            parts = [text_preview]

        for i, part in enumerate(parts[:3]):
            sections.append(dict(
                id=f"s{i+1}", title=["开篇与背景", "核心内容", "结论与要点"][i],
                eyebrow=f"{filename} · 第{i+1}部分",
                strict_track=part[:3000],
                companion_track="尚未完成 AI 陪读生成。可先依据严格轨学习，随后在资料库选择“重新生成”获取针对性讲解。",
                source=dict(label="上传文件"),
            ))

    # --- Map summaries (AI or generic) ------------------------------------
    ai_map = (ai_data.get("map_summaries") or {}) if ai_data else {}
    map_keys = ["problem", "method", "evidence", "conclusion", "limitations"]
    map_titles = ["问题与动机", "方法与设计", "证据与结果", "结论与影响", "局限与边界"]
    # Position each map node summary at a different part of the text
    map_positions = [0, 0.15, 0.35, 0.60, 0.78]  # fraction into source_text
    map_items = []
    for key, mtitle, pos in zip(map_keys, map_titles, map_positions):
        summary = ai_map.get(key, "") if isinstance(ai_map, dict) else ""
        if not summary and source_text and len(source_text) > 100:
            start = int(len(source_text) * pos)
            chunk = source_text[start:start + 300].strip()
            # Try to break at a sentence boundary
            for sep in [". ", ".\n", "。", "\n\n", "\n", ". "]:
                dot = chunk.rfind(sep)
                if dot > 60:
                    chunk = chunk[:dot + len(sep)].strip()
                    break
            summary = chunk if len(chunk) > 40 else source_text[start:start + 300].strip()
        if not summary:
            summary = "阅读材料后自行总结"
        map_items.append(dict(key=key, title=mtitle, summary=summary, source=dict(label="上传文件")))

    # --- Smart questions (AI or generic) ------------------------------------
    ai_questions = ai_data.get("questions", []) if ai_data else []
    if ai_questions and isinstance(ai_questions, list) and len(ai_questions) >= 3:
        questions = []
        for index, q in enumerate(ai_questions[:3]):
            questions.append(dict(
                id=f"q{index + 1}",
                kind=str(q.get("kind", "concept"))[:32],
                prompt=str(q.get("prompt", "请根据材料内容回答。"))[:1000],
                hint=str(q.get("hint", ""))[:500],
                source=dict(label="上传文件", detail=str(q.get("source", ""))[:500]),
                answer_guide=str(q.get("answer_guide", ""))[:2000],
                max_score=_bounded_int(q.get("max_score"), 1, 20, 4),
            ))
    else:
        questions = [
            dict(id="q1", kind="concept", prompt="这篇文章/材料要解决什么问题？作者是如何定位这个问题的？",
                 hint="关注开篇的问题陈述和研究动机。", source=dict(label="材料开头"),
                 answer_guide="准确描述研究问题和动机。", max_score=4),
            dict(id="q2", kind="method", prompt="作者使用了什么方法或技术方案？请描述关键步骤。",
                 hint="关注方法部分的具体步骤。", source=dict(label="材料方法部分"),
                 answer_guide="准确描述方法的关键步骤。", max_score=4),
            dict(id="q3", kind="evidence", prompt="作者得到了什么结论？有什么证据支持，又有哪些局限？",
                 hint="区分论文结论和你自己的推断。", source=dict(label="材料结论部分"),
                 answer_guide="指出结论、证据和局限。", max_score=3),
        ]

    material = dict(
        id=mid, title=title,
        subtitle=f"上传材料 · {source_type.upper()} · {text_len} 字",
        source_type=source_type, estimated_minutes=20, difficulty="自助探索",
        progress=0, created_at=datetime.now(UTC).isoformat(),
        map=map_items,
        learning_goals=["理解材料要解决的核心问题", "掌握关键方法或技术", "能用自己的话复述主要发现"],
        sections=sections,
        questions=questions,
        generation=generation,
        _hash=content_hash,
        _owner_id=user_id,
    )
    store.seed_senet(material)

    # Persist to Supabase so material survives cold starts
    if _supa_ok():
        try:
            _supa_up("materials", {"id": mid, "user_id": user_id, "payload_json": material})
        except Exception as exc:
            logger.warning("material_persist_failed material_id=%s error=%s", mid, type(exc).__name__)
            store.delete_material(mid, user_id)
            raise HTTPException(503, "材料暂时无法安全保存，请稍后重试。") from exc

    # Keep source excerpts locally.  Embedding them here used to add a second
    # sequential DeepSeek request to upload and delay the first visible lesson.
    chunk_texts = _chunk_text(source_text[:10000]) if source_text else []
    if chunk_texts:
        store.set_chunks(mid, [{"text": chunk} for chunk in chunk_texts])

    return _public_material(material)


@app.delete("/api/materials/{material_id}")
def delete_material(
    material_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    """Delete an uploaded material (not built-in SENet)."""
    user_id = _auth_user(authorization, required=True)
    assert user_id is not None
    if material_id == "senet-cvpr-2018":
        raise HTTPException(403, "内置材料不可删除。")
    material = _get_material_for_user(material_id, user_id)
    if material is None:
        raise HTTPException(404, "材料不存在。")
    if _supa_ok():
        try:
            _supa_del("materials", material_id, user_id)
        except Exception as exc:
            logger.warning("material_delete_persist_failed material_id=%s error=%s", material_id, type(exc).__name__)
            raise HTTPException(503, "材料暂时无法安全删除，请稍后重试。") from exc
    store.delete_material(material_id, user_id)
    return {"deleted": material_id}


@app.post("/api/materials/{material_id}/regenerate")
async def regenerate_material(
    material_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    """Re-run AI translation + questions on an existing material."""
    user_id = _auth_user(authorization, required=True)
    assert user_id is not None
    if material_id == "senet-cvpr-2018":
        raise HTTPException(403, "内置材料不需要重新生成。")
    m = _get_material_for_user(material_id, user_id)
    if m is None:
        raise HTTPException(404, "材料不存在。")
    original_material = json.loads(json.dumps(m))

    source_text = ""
    for s in m.get("sections", []):
        source_text += s.get("strict_track", "")
    if not source_text or len(source_text) < 50:
        raise HTTPException(400, "该材料没有足够原文内容，无法重新生成翻译。")

    filename = m.get("title", "untitled")
    if not os.getenv("DEEPSEEK_API_KEY"):
        raise HTTPException(503, "DeepSeek API 未配置，暂时无法重新生成。")
    _require_ai_quota(user_id, "regenerate")
    started_at = time.monotonic()
    try:
        ai_data = await _ai_generate(filename, source_text)
    except Exception as exc:
        logger.warning("material_regeneration_failed material_id=%s error=%s", material_id, type(exc).__name__)
        raise HTTPException(502, "AI 重新生成暂时不可用，请稍后重试。") from exc
    finally:
        logger.info("material_regeneration_finished material_id=%s elapsed_ms=%d", material_id, int((time.monotonic() - started_at) * 1000))

    if not ai_data:
        raise HTTPException(502, "AI 没有返回可用内容，请稍后重试。")

    if ai_data:
        ai_sections = ai_data.get("sections_translation") or []
        if ai_sections and isinstance(ai_sections, list):
            existing = list(m.get("sections", []))
            for i, s in enumerate(ai_sections[:len(existing)]):
                existing[i]["companion_track"] = s.get("companion_track", existing[i].get("companion_track",""))
            m["sections"] = existing

        ai_map = ai_data.get("map_summaries") or {}
        if ai_map and isinstance(ai_map, dict):
            for node in m.get("map", []):
                key = node.get("key", "")
                if ai_map.get(key):
                    node["summary"] = ai_map[key]

        ai_questions = ai_data.get("questions", [])
        if ai_questions and isinstance(ai_questions, list) and len(ai_questions) >= 3:
            m["questions"] = [dict(
                id=f"q{i + 1}",
                kind=str(q.get("kind", "concept"))[:32],
                prompt=str(q.get("prompt", ""))[:1000],
                hint=str(q.get("hint", ""))[:500],
                source=dict(label="上传文件", detail=str(q.get("source", ""))[:500]),
                answer_guide=str(q.get("answer_guide", ""))[:2000],
                max_score=_bounded_int(q.get("max_score"), 1, 20, 4),
            ) for i, q in enumerate(ai_questions[:3])]

        m["generation"] = {"status": "ready", "message": "AI 已重新生成针对性题目与陪读内容。"}

    # Re-persist
    if _supa_ok():
        try:
            _supa_up("materials", {"id": material_id, "user_id": user_id, "payload_json": m})
        except Exception as exc:
            logger.warning("material_persist_failed material_id=%s error=%s", material_id, type(exc).__name__)
            store.seed_senet(original_material)
            raise HTTPException(503, "材料更新暂时无法安全保存，请稍后重试。") from exc

    return _public_material(m)


class CreateSessionRequest(BaseModel):
    material_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    persona_id: str = Field(default="huangfeng", min_length=1, max_length=64)
    questions: list[QuestionReference] | None = Field(default=None, max_length=3)


@app.post("/api/sessions", status_code=201)
def create_session(
    req: CreateSessionRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    user_id = _auth_user(authorization, required=req.material_id != "senet-cvpr-2018")
    material = _get_material_for_user(req.material_id, user_id)
    if material is None:
        raise HTTPException(404, "材料不存在。")
    if not any(p["id"] == req.persona_id for p in PERSONAS):
        raise HTTPException(400, "陪读人格不存在。")
    _validate_question_ids(
        [str(question.get("id", "")) for question in material.get("questions", [])],
        material.get("questions", []),
    )
    sid = uuid.uuid4().hex
    session = store.create_session(sid, req.material_id, req.persona_id, user_id)
    return _public_session(session)


@app.post("/api/sessions/{session_id}/evaluate")
async def evaluate_session(
    session_id: str,
    req: EvaluationRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    if store.has_session(session_id):
        stored = store._sessions[session_id]
        required_auth = stored.get("material_id") != "senet-cvpr-2018"
        user_id = _auth_user(authorization, required=required_auth)
        session = store.get_session(session_id, user_id)
        if session is None:
            raise HTTPException(404, "学习会话不存在。")
    else:
        user_id = _auth_user(authorization, required=req.material_id != "senet-cvpr-2018")
        material = _get_material_for_user(req.material_id, user_id)
        if material is None:
            raise HTTPException(404, "材料不存在。")
        if not any(persona["id"] == req.persona_id for persona in PERSONAS):
            raise HTTPException(400, "陪读人格不存在。")
        session = store.create_session(session_id, req.material_id, req.persona_id, user_id)

    if session.get("material_id") != req.material_id or session.get("persona_id") != req.persona_id:
        raise HTTPException(422, "提交内容与学习会话不一致。")
    if session["status"] == "completed":
        raise HTTPException(409, "该学习会话已经完成。")

    material_id = session["material_id"]
    material = _get_material_for_user(material_id, user_id)
    if material is None:
        raise HTTPException(404, "材料不存在。")
    questions = material.get("questions", [])
    answers = [answer.model_dump() for answer in req.answers]
    _validate_question_ids([answer["question_id"] for answer in answers], questions)

    has_ai = bool(os.getenv("DEEPSEEK_API_KEY"))
    is_senet = material_id == "senet-cvpr-2018"
    chunks = store.get_chunks(material_id, user_id)
    material_title = material.get("title", "")
    review_link = _validated_review_link(req, user_id, material, session_id)

    if is_senet:
        _claim_review_measurement(review_link, user_id, session_id)
        result = evaluate_senet(dict(answers=answers, retelling=req.retelling))
        result = _normalize_evaluation_result(result, questions)
        result["evaluator"] = "rules"
    elif has_ai:
        assert user_id is not None
        _require_ai_quota(user_id, "evaluate")
        _claim_review_measurement(review_link, user_id, session_id)
        started_at = time.monotonic()
        try:
            result = await evaluate_with_deepseek(
                questions,
                answers,
                req.retelling,
                material_chunks=chunks,
                material_title=material_title,
            )
        except Exception as exc:
            logger.warning("deepseek_evaluation_failed session_id=%s material_id=%s error=%s", session_id, material_id, type(exc).__name__)
            raise HTTPException(502, "AI 评分暂时不可用，请重试。") from exc
        finally:
            logger.info("deepseek_evaluation_finished session_id=%s elapsed_ms=%d", session_id, int((time.monotonic() - started_at) * 1000))
        result = _normalize_evaluation_result(result, questions)
        result["evaluator"] = "ai"
    else:
        raise HTTPException(503, "DeepSeek API 未配置，无法评分上传材料。")

    completed = store.complete_session(
        session_id,
        answers,
        req.retelling,
        result,
    )
    public_completed = _public_session(completed)
    review_link = _finalize_review_link(
        review_link,
        public_completed.get("completed_at") or datetime.now(UTC).isoformat(),
    )
    public_completed["rubric_fingerprint"] = material_rubric_fingerprint(material)
    cloud_saved = False
    retry_token = None
    if user_id is not None:
        if review_link is not None:
            public_completed["review"] = review_link
        persona_name = next(
            persona["name"] for persona in PERSONAS if persona["id"] == session["persona_id"]
        )
        result_payload = public_completed.get("result") or {}
        record = {
            "session_id": session_id,
            "user_id": user_id,
            "material_id": material_id,
            "material_title": material_title,
            "persona_name": persona_name,
            "completed_at": public_completed.get("completed_at") or datetime.now(UTC).isoformat(),
            "mastery": int(result_payload.get("mastery", 0)),
            "headline": str(result_payload.get("headline", "本次学习已完成"))[:500],
            "misconception_tags": [str(tag)[:100] for tag in result_payload.get("misconception_tags", [])[:50]],
            "retelling": req.retelling,
            "answers": answers,
            "session_data": public_completed,
            "server_verified_at": datetime.now(UTC).isoformat(),
            "saved_at": datetime.now(UTC).isoformat(),
        }
        if _supa_ok():
            try:
                _supa_up_study_record(record)
            except Exception as exc:
                logger.warning("archive_save_failed error=%s", type(exc).__name__)
                retry_token = _sign_archive_retry(record)
            else:
                cloud_saved = True
        else:
            retry_token = _sign_archive_retry(record)
    public_completed["cloud_saved"] = cloud_saved
    if retry_token is not None:
        public_completed["cloud_retry_token"] = retry_token
    return public_completed



@app.post("/api/archive/retry")
def retry_archive_save(
    req: ArchiveRetryRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    user_id = _auth_user(authorization, required=True)
    assert user_id is not None
    if req.expected_user_id != user_id:
        raise HTTPException(409, "登录账号状态不一致，未执行云端恢复。")
    if not _supa_ok():
        raise HTTPException(503, "云端档案暂时不可用，请稍后重试。")
    record = _verify_archive_retry(req.retry_token)
    if record.get("user_id") != user_id:
        raise HTTPException(403, "这条恢复记录不属于当前账号。")
    try:
        _supa_up_study_record(record)
    except Exception as exc:
        logger.warning("archive_retry_failed error=%s", type(exc).__name__)
        raise HTTPException(503, "云端档案仍不可用，本地副本会继续保留。") from exc
    return {"cloud_saved": True, "session_id": record["session_id"]}


# NOTE: /api/archive intentionally not implemented here.
# The frontend reads archive directly from Supabase (cloud.ts -> loadCloudArchive).
# If we returned an empty array from this in-memory store, it would shadow the
# real Supabase archive, so the frontend fallback never triggers.  Returning 404
# lets the frontend's withDemo catch the error and fall back to Supabase/local.

register_transfer_routes(
    app,
    supa_url=_supa_url,
    service_headers=_service_headers,
    supa_ok=_supa_ok,
    supa_get=_supa_get,
    supa_rpc=_supa_rpc,
    auth_user=_auth_user,
    get_material_for_user=_get_material_for_user,
    get_chunks=store.get_chunks,
    require_ai_quota=_require_ai_quota,
    up_study_record=_supa_up_study_record,
    sign_archive_retry=_sign_archive_retry,
)

register_diagnostic_routes(
    app,
    supa_ok=_supa_ok,
    supa_get=_supa_get,
    supa_rpc=_supa_rpc,
    auth_user=_auth_user,
    get_material_for_user=_get_material_for_user,
)
