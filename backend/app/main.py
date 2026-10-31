"""CrunchWeek - CIT campus scheduling & venue management (FastAPI).

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
