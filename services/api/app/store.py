from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from .config import settings
from .content import SENET
from .models import EvaluationResult, MaterialInternal, SessionPublic


class Store:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or settings.database_path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS materials (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    material_id TEXT NOT NULL,
                    persona_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    answers_json TEXT,
                    retelling TEXT,
                    result_json TEXT,
                    FOREIGN KEY(material_id) REFERENCES materials(id)
                );
                """
            )
        self.save_material(SENET)

    def save_material(self, material: MaterialInternal) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO materials(id, title, source_type, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    source_type=excluded.source_type,
                    payload_json=excluded.payload_json
                """,
                (
                    material.id,
                    material.title,
                    material.source_type,
                    material.model_dump_json(),
                    material.created_at,
                ),
            )

    def list_materials(self) -> list[MaterialInternal]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM materials ORDER BY created_at DESC"
            ).fetchall()
        return [MaterialInternal.model_validate_json(row["payload_json"]) for row in rows]

    def get_material(self, material_id: str) -> MaterialInternal | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM materials WHERE id = ?", (material_id,)
            ).fetchone()
        if row is None:
            return None
        return MaterialInternal.model_validate_json(row["payload_json"])

    def create_session(self, session_id: str, material_id: str, persona_id: str) -> SessionPublic:
        started_at = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions(id, material_id, persona_id, status, started_at)
                VALUES (?, ?, ?, 'active', ?)
                """,
                (session_id, material_id, persona_id, started_at),
            )
        return SessionPublic(
            id=session_id,
            material_id=material_id,
            persona_id=persona_id,
            status="active",
            started_at=started_at,
        )

    def get_session(self, session_id: str) -> SessionPublic | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if row is None:
            return None
        result = (
            EvaluationResult.model_validate_json(row["result_json"]) if row["result_json"] else None
        )
        return SessionPublic(
            id=row["id"],
            material_id=row["material_id"],
            persona_id=row["persona_id"],
            status=row["status"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            result=result,
        )

    def complete_session(
        self,
        session_id: str,
        answers: list[dict[str, str]],
        retelling: str,
        result: EvaluationResult,
    ) -> SessionPublic:
        completed_at = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE sessions
                SET status='completed', completed_at=?, answers_json=?, retelling=?, result_json=?
                WHERE id=?
                """,
                (
                    completed_at,
                    json.dumps(answers, ensure_ascii=False),
                    retelling,
                    result.model_dump_json(),
                    session_id,
                ),
            )
        session = self.get_session(session_id)
        if session is None:
            raise RuntimeError("Session disappeared after update")
        return session

    def archive_rows(self) -> list[sqlite3.Row]:
        with self.connect() as connection:
            return connection.execute(
                """
                SELECT s.*, m.title AS material_title
                FROM sessions s
                JOIN materials m ON m.id = s.material_id
                WHERE s.status = 'completed'
                ORDER BY s.completed_at DESC
                """
            ).fetchall()


store = Store()
