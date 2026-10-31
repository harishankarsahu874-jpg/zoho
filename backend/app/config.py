"""App configuration (all values overridable via environment / .env)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(__file__).resolve().parent / "data"
DEFAULT_DATASET = DATA_DIR / "cit_public.json"
DB_PATH = DATA_DIR / "crunchweek.db"
DEFAULT_DATASET_PATH = DATA_DIR / "cit_public.json"


class Settings:
    def __init__(self) -> None:
        DATA_DIR.mkdir(exist_ok=True)
        self.database_url: str = os.environ.get(
            "DATABASE_URL", f"sqlite:///{DB_PATH}")
        self.jwt_secret: str = os.environ.get("JWT_SECRET", "crunchweek-dev-secret")
        self.jwt_algorithm: str = os.environ.get("JWT_ALGORITHM", "HS256")
        self.jwt_expire_minutes: int = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))
        self.team_name: str = os.environ.get("TEAM_NAME", "Spectra Solvers")
        self.openai_api_key: str = os.environ.get("OPENAI_API_KEY", "")
        self.openai_base_url: str = os.environ.get(
            "OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.llm_model: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")
        self.cors_origins: list[str] = [
            o.strip() for o in os.environ.get(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()
        ]

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
