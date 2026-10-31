from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dataset.models import Context
from ..services import state
from ..validation import checks
from .deps import get_current_user

router = APIRouter(prefix="/api", tags=["timetable"])


def _require_solution(db: Session) -> tuple[dict, Context]:
    sol = state.get_solution(db)
    if sol is None:
        raise HTTPException(409, "no timetable yet - generate one from the Admin page")
    return sol, state.get_ctx(db)


@router.get("/timetable")
def timetable_view(
    view: str = Query("week", pattern="^(week|group|faculty|room)$"),
    id: str | None = None,
    day: str | None = None,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    sol, ctx = _require_solution(db)
    assign = state.get_solution_assign(db)
    days = [d for d in ctx.days if not day or d == day]
    periods = list(range(1, 14))

    if view == "week":
        grid = {"sessions": checks.sessions_week_grid(ctx, assign),
                "bookings": _bookings_grid(ctx, sol)}
        return {"days": days, "periods": periods, **grid}
    if view == "group":
        if not id:
            raise HTTPException(400, "group id required")
        entries = [{"day": d, "start_period": p, "session_id": sid,
                    "room_id": assign[sid][2],
                    "course": ctx.sessions[sid].get("course_id")}
                   for sid, (d, p, r) in assign.items()
                   if id in ctx.sessions[sid].get("groups", [])]
        return {"group": id, "days": days, "periods": periods,
                "entries": sorted(entries, key=lambda e: (ctx.days.index(e["day"]), e["start_period"]))}
    if view == "faculty":
        if not id:
            raise HTTPException(400, "faculty id required")
        entries = [{"day": d, "start_period": p, "session_id": sid,
                    "room_id": assign[sid][2],
                    "course": ctx.sessions[sid].get("course_id")}
                   for sid, (d, p, r) in assign.items()
                   if ctx.sessions[sid].get("faculty_id") == id]
        return {"faculty": id, "days": days, "periods": periods,
                "entries": sorted(entries, key=lambda e: (ctx.days.index(e["day"]), e["start_period"]))}
    if view == "room":
        if not id:
            raise HTTPException(400, "room id required")
        entries = [{"day": d, "start_period": p, "session_id": sid}
                   for sid, (d, p, r) in assign.items() if r == id]
        bookings = [b for b in sol.get("fest_week", {}).get("bookings", [])
                    if b.get("room_id") == id and b.get("status") == "approved"]
        return {"room": id, "days": days, "periods": periods,
                "entries": sorted(entries, key=lambda e: (ctx.days.index(e["day"]), e["start_period"])),
                "bookings": bookings,
                "capacity": ctx.rooms[id]["capacity"]}
    raise HTTPException(400, "unknown view")


def _bookings_grid(ctx: Context, sol: dict) -> dict:
    """approved manual+dataset bookings as {room|day -> [{start,end,title,req}]}."""
    grid: dict = {}
    for b in sol.get("fest_week", {}).get("bookings", []):
        if b.get("status") != "approved" or not b.get("room_id"):
            continue
        key = (b["room_id"], b["day"])
        grid.setdefault(f"{b['room_id']}|{b['day']}", []).append(
            {"start": b.get("start_period"), "end": b.get("end_period"),
             "request_id": b.get("request_id"), "manual": b.get("manual", False)})
    return grid


@router.get("/exams")
def exams(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    sol, ctx = _require_solution(db)
    return {"exams": sol.get("exams", [])}


@router.get("/reference")
def reference(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Reference data for dropdowns: groups, faculty, rooms."""
    ctx = state.get_ctx(db)
    return {
        "days": ctx.days,
        "groups": [{"id": g, "name": ctx.groups[g].get("name", g)}
                   for g in sorted(ctx.groups)],
        "faculty": sorted(ctx.fac),
        "rooms": [{"id": r, "capacity": r2["capacity"], "type": r2["type"],
                   "accessible": r2["accessible"], "features": r2["features"]}
                  for r, r2 in sorted(ctx.rooms.items())],
        "sessions": [{"id": s["id"], "course": s.get("course_id"),
                      "groups": s.get("groups", []), "kind": s["kind"],
                      "faculty": s.get("faculty_id"), "size": s["size"],
                      "duration": s.get("duration", 1)}
                     for s in ctx.data["sessions"]],
        "exams": [{"id": e["id"], "course_ids": e.get("course_ids", []),
                   "groups": e.get("groups", []), "size": e.get("size")}
                  for e in ctx.data.get("exams", [])],
    }
