from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ChangeRequest
from ..services import jobs, scheduler_service, state
from .deps import get_current_user, require_role

router = APIRouter(prefix="/api/changes", tags=["changes"])


class ChangeSubmit(BaseModel):
    """A schedule change request (any of the dataset change-file operations)."""
    changes: list[dict]  # [{"type": "faculty_unavailable", "faculty": "F07", ...}]


@router.post("")
def submit(body: ChangeSubmit, db: Session = Depends(get_db),
           user=Depends(get_current_user)):
    if not body.changes:
        raise HTTPException(422, "no changes given")
    row = ChangeRequest(payload=json.dumps({"changes": body.changes}),
                        created_by=user.email)
    db.add(row)
    db.commit()
    cid = row.id
    state.log(db, user.email, "change.submitted", {"change_id": cid,
                                                   "changes": body.changes})

    def work(db: Session) -> dict:
        try:
            res = scheduler_service.propose_change(db, body.changes)
        except Exception as e:  # noqa: BLE001
            return {"infeasible": True, "reason": str(e)}
        return res

    return start_proposal(cid, body.changes)


def start_proposal(cid: int, changes: list[dict]) -> dict:
    def work(db: Session) -> dict:
        try:
            return scheduler_service.propose_change(db, changes)
        except Exception as e:  # noqa: BLE001
            return {"infeasible": True, "reason": str(e)}

    job_id = jobs.start_job(get_db_factory(), work, f"propose change #{cid}")

    def record(job: dict) -> None:
        from ..database import SessionLocal
        with SessionLocal() as jdb:
            r = jdb.get(ChangeRequest, cid)
            if r is None:
                return
            if job.get("status") == "done":
                r.proposal = json.dumps(job.get("result") or {})
            elif job.get("status") == "error":
                r.proposal = json.dumps({"infeasible": True,
                                         "reason": job.get("error")})
            jdb.commit()

    jobs.on_done(job_id, record)
    return {"change_id": cid, "job_id": job_id,
            "message": "Proposal is being computed (least-moves repair); "
                       "poll the change until status is ready."}


def get_db_factory():
    from ..database import SessionLocal
    return lambda: SessionLocal()


@router.get("")
def list_changes(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    out = []
    for r in db.query(ChangeRequest).order_by(ChangeRequest.id).all():
        p = json.loads(r.proposal or "{}")
        out.append({"id": r.id, "payload": json.loads(r.payload), "status": r.status,
                    "created_by": r.created_by,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "proposal": {
                        "infeasible": p.get("infeasible", False),
                        "reason": p.get("reason"),
                        "stability": p.get("stability"),
                        "soft_total": (p.get("report") or {}).get("soft_total"),
                    }})
    return {"changes": out}


@router.get("/{cid}")
def get_change(cid: int, db: Session = Depends(get_db),
               _user=Depends(get_current_user)):
    r = db.get(ChangeRequest, cid)
    if r is None:
        raise HTTPException(404, "unknown change")
    p = json.loads(r.proposal or "{}")
    return {"id": r.id, "payload": json.loads(r.payload), "status": r.status,
            "created_by": r.created_by, "proposal": p}


@router.post("/{cid}/approve")
def approve(cid: int, db: Session = Depends(get_db),
            user=Depends(require_role("admin"))):
    r = db.get(ChangeRequest, cid)
    if r is None:
        raise HTTPException(404, "unknown change")
    if r.status != "pending":
        raise HTTPException(409, f"change already {r.status}")
    p = json.loads(r.proposal or "{}")
    if p.get("infeasible") or "schedule" not in p:
        raise HTTPException(409, "no valid proposal yet - "
                                 + str(p.get("reason") or "still computing"))
    from ..dataset.models import apply_disruption
    changes = json.loads(r.payload)["changes"]
    state.set_dataset(db, apply_disruption(state.get_dataset(db),
                                           {"changes": changes}))
    state.set_solution(db, p["schedule"])
    r.status = "approved"
    db.commit()
    state.log(db, user.email, "change.approved", {"change_id": cid,
                                                  "stability": p.get("stability")})
    return {"ok": True, "stability": p.get("stability")}


@router.post("/{cid}/reject")
def reject(cid: int, db: Session = Depends(get_db),
           user=Depends(require_role("admin"))):
    r = db.get(ChangeRequest, cid)
    if r is None:
        raise HTTPException(404, "unknown change")
    if r.status != "pending":
        raise HTTPException(409, f"change already {r.status}")
    r.status = "rejected"
    db.commit()
    state.log(db, user.email, "change.rejected", {"change_id": cid})
    return {"ok": True}
