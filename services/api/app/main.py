from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .ai import AIServiceError, evaluate_with_ai, extract_source, generate_material
from .config import settings
from .content import PERSONAS
from .models import (
    ArchiveItem,
    EvaluationRequest,
    MaterialInternal,
    MaterialPublic,
    MaterialSummary,
    Persona,
    SessionCreate,
    SessionPublic,
)
from .scoring import evaluate_senet
from .store import store


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.initialize()
    yield


app = FastAPI(title=settings.app_name, version="0.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def public_material(material: MaterialInternal) -> MaterialPublic:
    return MaterialPublic.model_validate(material.model_dump())


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    provider = settings.ai_provider
    ai_configured = (
        bool(settings.deepseek_api_key)
        if provider == "deepseek"
        else bool(settings.openai_api_key)
    )
    model = settings.deepseek_model if provider == "deepseek" else settings.openai_model
    return {
        "status": "ok",
        "version": "v.0",
        "ai_configured": ai_configured,
        "ai_provider": provider,
        "model": model,
    }


@app.get("/api/personas", response_model=list[Persona])
def list_personas() -> list[Persona]:
    return PERSONAS


@app.get("/api/materials", response_model=list[MaterialSummary])
def list_materials() -> list[MaterialSummary]:
    return [
        MaterialSummary(
            id=material.id,
            title=material.title,
            subtitle=material.subtitle,
            source_type=material.source_type,
            estimated_minutes=material.estimated_minutes,
            difficulty=material.difficulty,
            progress=material.progress,
            created_at=material.created_at,
        )
        for material in store.list_materials()
    ]


@app.get("/api/materials/{material_id}", response_model=MaterialPublic)
def get_material(material_id: str) -> MaterialPublic:
    material = store.get_material(material_id)
    if material is None:
        raise HTTPException(status_code=404, detail="材料不存在。")
    return public_material(material)


@app.post("/api/materials/upload", response_model=MaterialPublic, status_code=201)
async def upload_material(file: UploadFile = File(...)) -> MaterialPublic:
    filename = file.filename or "untitled"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".md", ".markdown"}:
        raise HTTPException(status_code=400, detail="只支持 PDF 或 Markdown。")

    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="文件不能超过 10 MB。")
    try:
        source_type, source_text = await run_in_threadpool(extract_source, filename, content)
        generated = await run_in_threadpool(generate_material, filename, source_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    material = MaterialInternal(
        id=f"upload-{uuid.uuid4().hex[:12]}",
        source_type=source_type,
        progress=0,
        created_at=datetime.now(UTC).isoformat(),
        **generated.model_dump(),
    )
    store.save_material(material)
    return public_material(material)


@app.post("/api/sessions", response_model=SessionPublic, status_code=201)
def create_session(request: SessionCreate) -> SessionPublic:
    if store.get_material(request.material_id) is None:
        raise HTTPException(status_code=404, detail="材料不存在。")
    if not any(persona.id == request.persona_id for persona in PERSONAS):
        raise HTTPException(status_code=400, detail="陪读人格不存在。")
    return store.create_session(
        session_id=uuid.uuid4().hex,
        material_id=request.material_id,
        persona_id=request.persona_id,
    )


@app.get("/api/sessions/{session_id}", response_model=SessionPublic)
def get_session(session_id: str) -> SessionPublic:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="学习会话不存在。")
    return session


@app.post("/api/sessions/{session_id}/evaluate", response_model=SessionPublic)
async def evaluate_session(
    session_id: str,
    request: EvaluationRequest,
) -> SessionPublic:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="学习会话不存在。")
    if session.status == "completed":
        raise HTTPException(status_code=409, detail="该学习会话已经完成。")
    material = store.get_material(session.material_id)
    if material is None:
        raise HTTPException(status_code=404, detail="材料不存在。")

    if material.id == "senet-cvpr-2018":
        result = evaluate_senet(material, request)
    else:
        try:
            result = await run_in_threadpool(evaluate_with_ai, material, request, session_id)
        except AIServiceError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return store.complete_session(
        session_id=session_id,
        answers=[answer.model_dump() for answer in request.answers],
        retelling=request.retelling,
        result=result,
    )


@app.get("/api/archive", response_model=list[ArchiveItem])
def archive() -> list[ArchiveItem]:
    persona_by_id = {persona.id: persona.name for persona in PERSONAS}
    items: list[ArchiveItem] = []
    for row in store.archive_rows():
        result = json.loads(row["result_json"])
        items.append(
            ArchiveItem(
                session_id=row["id"],
                material_id=row["material_id"],
                material_title=row["material_title"],
                persona_name=persona_by_id.get(row["persona_id"], row["persona_id"]),
                completed_at=row["completed_at"],
                mastery=result["mastery"],
                headline=result["headline"],
                misconception_tags=result["misconception_tags"],
                retelling=row["retelling"],
            )
        )
    return items
