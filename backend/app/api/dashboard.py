from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dataset.models import Context
from ..database import get_db
from ..services import state
from ..validation import checks
from .deps import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    data = state.get_dataset(db)
    ctx = state.get_ctx(db)
    sol = state.get_solution(db)
    out = {
        "dataset_id": data.get("dataset_id"),
        "counts": {"sessions": len(data["sessions"]),
                   "rooms": len(ctx.rooms),
                   "faculty": len(ctx.fac),
                   "groups": len(ctx.groups),
                   "bookings": len(data.get("booking_requests", [])),
                   "exams": len(data.get("exams", []))},
        "timetable_generated": sol is not None,
        "conflicts": None,
        "soft_penalty": None,
        "bookings": None,
        "room_utilisation": None,
        "pending": None,
        "exams": None,
    }
    if sol is None:
        from ..models import ChangeRequest, ManualBooking
        out["pending"] = {
            "changes": db.query(ChangeRequest).filter(
                ChangeRequest.status == "pending").count(),
            "bookings": db.query(ManualBooking).filter(
                ManualBooking.status == "pending").count(),
        }
        return out

    report = checks.validate(data, sol)
    out["conflicts"] = {"hard": report["hard_violation_count"],
                        "soft": report["soft_total"],
                        "soft_breakdown": report.get("soft_penalties", {}),
                        "hard_list": report["hard_violations"][:10]}
    out["soft_penalty"] = report["soft_total"]
    fest = sol.get("fest_week", {})
    bstats = report.get("bookings", {})
    out["bookings"] = {"approved": bstats.get("approved", 0),
                       "alternative_offered": bstats.get("alternatives", 0),
                       "rejected": bstats.get("rejected", 0),
                       "score": bstats.get("booking_score"),
                       "max_score": bstats.get("booking_score_max_if_all_approved"),
                       "inversions": bstats.get("priority_inversions", [])}
    # room utilisation over the teaching week (P1..P9)
    assign = state.get_solution_assign(db)
    used: dict[str, int] = {}
    for sid, (day, start, rid) in assign.items():
        meta = ctx.sessions.get(sid)
        dur = int(meta.get("duration", 1) or 1) if meta else 1
        for p in range(start, start + dur):
            if 1 <= p <= 9 and rid in ctx.rooms:
                used[rid] = used.get(rid, 0) + 1
    per_room_max = len(ctx.days) * 9
    total_cells = len(ctx.rooms) * per_room_max
    out["room_utilisation"] = {
        "overall": round(100 * sum(used.values()) / max(total_cells, 1), 1),
        "per_room": [{"room": rid, "capacity": ctx.rooms[rid]["capacity"],
                      "used_periods": used.get(rid, 0),
                      "pct": round(100 * used.get(rid, 0) / per_room_max, 1)}
                     for rid in sorted(used)],
    }
    from ..models import ChangeRequest, ManualBooking
    out["pending"] = {
        "changes": db.query(ChangeRequest).filter(
            ChangeRequest.status == "pending").count(),
        "bookings": db.query(ManualBooking).filter(
            ManualBooking.status == "pending").count(),
    }
    out["exams"] = {"placed": len(sol.get("exams", [])),
                    "soft": report.get("exam_soft_penalty")}
    return out
