from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env.local")


@dataclass(frozen=True)
class Settings:
    app_name: str = "个性化陪读阅读室 API"
    app_env: str = os.getenv("APP_ENV", "development")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    database_path: Path = Path(
        os.getenv(
            "DATABASE_PATH",
            PROJECT_ROOT / "services" / "api" / "data" / "study_room.db",
        )
    )
    max_upload_bytes: int = 10 * 1024 * 1024
    max_pdf_pages: int = 30
    max_source_chars: int = 60_000


settings = Settings()
