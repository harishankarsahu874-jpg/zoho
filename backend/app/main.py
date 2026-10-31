"""CrunchWeek - CIT campus scheduling & venue management (FastAPI).

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000

If a production build exists at frontend/dist, this server also serves the
whole web app (SPA fallback) — one URL for API + UI. In dev, the Vite server
(:5173) proxies /api here instead.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import admin, ai, auth, bookings, changes, dashboard, timetable
from .config import get_settings
from .database import SessionLocal, init_db
from .services import state

app = FastAPI(title="CrunchWeek", version="1.0.0",
              description="CIT campus scheduling + venue management platform")

s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=s.cors_origins + ["*"],  # deployed preview host is dynamic
    allow_credentials=False,  # keep True-safe: token is in Authorization header
    allow_methods=["*"],
    allow_headers=["*"],
)

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@app.on_event("startup")
def _startup() -> None:
    init_db()
    with SessionLocal() as db:
        state.seed_users(db)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "crunchweek", "team": s.team_name}


app.include_router(auth.router)
app.include_router(timetable.router)
app.include_router(bookings.router)
app.include_router(changes.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(ai.router)

# ---------------------------------------------------------------------------
# Production frontend: serve frontend/dist if it exists (SPA fallback).
# Registered last so every /api/*, /docs, /openapi.json route wins first.
# ---------------------------------------------------------------------------
if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "unknown API endpoint")
        if full_path in ("docs", "openapi.json", "redoc"):
            raise HTTPException(404)
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
