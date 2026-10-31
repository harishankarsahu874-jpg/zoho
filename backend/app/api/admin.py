from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import jobs, scheduler_service, state
from ..validation import checks
from .deps import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_db_factory():
    from ..database import SessionLocal
    return lambda: SessionLocal()


@router.post("/generate")
def generate(time_limit: float = 120.0,
             db: Session = Depends(get_db),
             user=Depends(require_role("admin"))):
    def work(db: Session) -> dict:
        return scheduler_service.generate(db, time_limit=time_limit)

    job_id = jobs.start_job(get_db_factory(), work, "generate timetable")
    return {"job_id": job_id,
            "message": "Solving in the background (CP-SAT + polish). Poll "
                       "/api/admin/jobs/{job_id}."}


@router.get("/jobs/{job_id}")
def job(job_id: str, db: Session = Depends(get_db),
        user=Depends(require_role("admin"))):
    j = jobs.get_job(job_id)
    if j is None:
        raise HTTPException(404, "unknown job")
    out = {k: v for k, v in j.items() if k != "traceback"}
    return out


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db),
              user=Depends(require_role("admin"))):
    return {"jobs": [{k: v for k, v in j.items() if k != "traceback"}
                     for j in jobs.list_jobs()]}


@router.post("/reset-demo")
def reset(db: Session = Depends(get_db), user=Depends(require_role("admin"))):
    state.reset_demo(db)
    state.log(db, user.email, "admin.reset_demo")
    return {"ok": True, "message": "Demo data restored to the pristine "
                                   "starter-pack dataset."}


@router.get("/solution")
def current_solution(db: Session = Depends(get_db),
                     user=Depends(require_role("admin"))):
    sol = state.get_solution(db)
    if sol is None:
        return {"exists": False}
    data = state.get_dataset(db)
    report = checks.validate(data, sol)
    return {"exists": True, "report": report}


@router.get("/export")
def export(db: Session = Depends(get_db), user=Depends(require_role("admin"))):
    sol = state.get_solution(db)
    if sol is None:
        raise HTTPException(409, "no schedule to export - generate one first")
    return JSONResponse({"download": "schedule.json",
                         "content": json.dumps(sol, indent=2)})


@router.post("/dataset")
async def load_dataset(file: UploadFile,
                       db: Session = Depends(get_db),
                       user=Depends(require_role("admin"))):
    """Load a new cit_public-format dataset JSON (replaces the current one)."""
    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "file is not valid JSON")
    for key in ("dataset_id", "days", "rooms", "faculty", "groups", "sessions"):
        if key not in data:
            raise HTTPException(400, f"dataset missing key: {key}")
    state.set_dataset(db, data)
    state.set_solution(db, None)  # stale solution invalid for the new dataset
    state.set_json(db, "dataset_booking_overrides", {})
    state.log(db, user.email, "admin.dataset_loaded",
              {"dataset_id": data.get("dataset_id"),
               "sessions": len(data.get("sessions", []))})
    return {"ok": True, "dataset_id": data.get("dataset_id"),
            "sessions": len(data.get("sessions", [])),
            "message": "Dataset loaded. Generate a timetable to solve it."}


class PriorityBody(BaseModel):
    priority_order: list[str]


@router.put("/priority-order")
def priority_order(body: PriorityBody, db: Session = Depends(get_db),
                   user=Depends(require_role("admin"))):
    base = list(state.get_dataset(db).get("priority_order",
                                          ["exam", "regular_session",
                                           "institute_event", "guest_lecture",
                                           "department_event", "club_event"]))
    if sorted(body.priority_order) != sorted(base):
        raise HTTPException(422, "priority_order must be a permutation of "
                                 f"{base}")
    state.set_json(db, "priority_order", body.priority_order)
    # the engine reads the order from the dataset copy
    data = state.get_dataset(db)
    data["priority_order"] = body.priority_order
    state.set_dataset(db, data)
    state.log(db, user.email, "admin.priority_order",
              {"order": body.priority_order})
    if state.get_solution(db):
        scheduler_service.rebook(db)
    return {"ok": True, "priority_order": body.priority_order}


@router.get("/audit")
def audit(limit: int = 100, db: Session = Depends(get_db),
          user=Depends(require_role("admin"))):
    from ..models import AuditLog
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()
    return {"entries": [{"id": r.id, "actor": r.actor, "action": r.action,
                         "detail": json.loads(r.detail or "{}"),
                         "at": r.at.isoformat() if r.at else None}
                        for r in rows]}
