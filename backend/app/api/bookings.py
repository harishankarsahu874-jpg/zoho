from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..ai.parser import parse_booking_text
from ..database import get_db
from ..services import scheduler_service, state
from ..validation import checks
from .deps import get_current_user, require_role

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _all_decisions(db: Session) -> list[dict]:
    sol = state.get_solution(db)
    return (sol or {}).get("fest_week", {}).get("bookings", [])


def _request_index(db: Session) -> dict:
    data = state.get_dataset(db)
    out = {r["id"]: r for r in data.get("booking_requests", [])}
    for mb in state.manual_bookings(db):
        out[f"MB-{mb['id']}"] = mb["payload"]
    return out


def _priority_order(db: Session) -> list[str]:
    return state.get_json(db, "priority_order",
                          state.get_dataset(db).get("priority_order",
                                                    ["exam", "regular_session",
                                                     "institute_event",
                                                     "guest_lecture",
                                                     "department_event",
                                                     "club_event"]))


@router.get("")
def list_bookings(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    reqs = _request_index(db)
    out = []
    for d in _all_decisions(db):
        rid = d.get("request_id")
        if rid in reqs:
            out.append({"decision": d, "request": reqs[rid]})
    decided = {d.get("request_id") for d in _all_decisions(db)}
    for mb in state.manual_bookings(db):
        rid = f"MB-{mb['id']}"
        if rid not in decided and mb["status"] == "pending":
            out.append({"decision": {"request_id": rid, "status": "pending",
                                     "reason": "awaiting coordinator/admin decision"},
                        "request": mb["payload"]})
    out.sort(key=lambda e: e["decision"].get("request_id") or "")
    return {"bookings": out, "priority_order": _priority_order(db)}


# ------------------------------------------------------------------ create
class BookingCreate(BaseModel):
    title: str
    role: str = "club"
    requested_category: str = "club_event"
    attendance: int
    duration_periods: int
    windows: list[dict]  # [{day, from_period, to_period}]
    room_types: list[str]
    needs: list[str] = []
    requested_room: str | None = None
    mandatory_for_groups: list[str] = []
    notes: str | None = None


class BookingAIBody(BaseModel):
    text: str


@router.post("/ai-draft")
def ai_draft(body: BookingAIBody, db: Session = Depends(get_db),
             _user=Depends(get_current_user)):
    """Plain-language (English/Hinglish) request -> structured draft.
    Draft only: the user edits it, then submits it for a decision."""
    ctx = state.get_ctx(db)
    res = parse_booking_text(ctx, body.text)
    problems = []
    if not res["follow_up"]:
        problems = state.validate_manual_booking(ctx, res["payload"], [])
    return {"draft": res["payload"], "follow_up": res["follow_up"],
            "llm_used": res["llm_used"], "problems": problems}


@router.post("")
def create_booking(body: BookingCreate, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    ctx = state.get_ctx(db)
    payload = body.model_dump()
    problems = state.validate_manual_booking(ctx, payload,
                                             state.manual_bookings(db))
    if problems:
        raise HTTPException(422, {"problems": problems})
    from ..models import ManualBooking
    row = ManualBooking(payload=json.dumps(payload), status="pending",
                        created_by=user.email)
    db.add(row)
    db.commit()
    rid = f"MB-{row.id}"
    state.log(db, user.email, "booking.created",
              {"request_id": rid, "title": payload["title"]})
    return {"id": row.id, "request_id": rid,
            "message": "Request recorded. A coordinator or admin will decide "
                       "it; approved bookings appear in the fest week."}


# ------------------------------------------------------------------ decide
class DecideBody(BaseModel):
    status: str  # approved | rejected | alternative_offered
    reason: str | None = None
    day: str | None = None
    start_period: int | None = None
    end_period: int | None = None
    room_id: str | None = None


@router.post("/{request_id}/decide")
def decide(request_id: str, body: DecideBody, db: Session = Depends(get_db),
           user=Depends(require_role("admin", "department_coordinator"))):
    from ..models import ManualBooking
    req = _request_index(db).get(request_id)
    if req is None:
        raise HTTPException(404, "unknown booking request")
    if body.status not in ("approved", "rejected", "alternative_offered"):
        raise HTTPException(422, "invalid status")

    if body.status in ("approved", "alternative_offered"):
        sol = state.get_solution(db)
        if sol is None:
            raise HTTPException(409, "generate a timetable first")
        ctx = state.get_ctx(db)
        assign = state.get_solution_assign(db)
        from ..solver.bookings import _cell_free, room_busy_of
        room_busy = room_busy_of(ctx, assign)
        week_grp = checks.grp_occ_of(ctx, assign)
        for d in _all_decisions(db):
            if d.get("status") in ("approved", "alternative_offered") \
                    and d.get("room_id") and d.get("request_id") != request_id:
                for p in range(d.get("start_period", 0), d.get("end_period", 0) + 1):
                    room_busy.setdefault((d["room_id"], d["day"], p),
                                         []).append(d.get("request_id"))
        day, a, b, rid = body.day, body.start_period, body.end_period, body.room_id
        if not (day and a and b and rid):
            raise HTTPException(422,
                                "day/start_period/end_period/room_id required")
        if b - a + 1 != int(req.get("duration_periods", 1)):
            raise HTTPException(422,
                                 f"duration mismatch: request needs "
                                 f"{req.get('duration_periods')} periods, you gave "
                                 f"{b - a + 1}")
        ok, blocker = _cell_free(ctx, room_busy, week_grp, rid, day,
                                 range(a, b + 1), req)
        if not ok:
            raise HTTPException(409, {"blocker": blocker,
                                      "hint": "pick another room or slot, or use "
                                              "alternative_offered with a reason"})
        window_ok = any(w["day"] == day and w["from_period"] <= a and
                        b <= w["to_period"] for w in req.get("windows", []))
        if body.status == "approved" and not window_ok:
            raise HTTPException(422, "approved placement must be inside the "
                                     "requested windows; use alternative_offered")
        room = ctx.rooms[rid]
        feats = set(room["features"]) | ({"accessible"} if room["accessible"]
                                         else set())
        if (room["type"] not in req.get("room_types", [])
                or room["capacity"] < int(req.get("attendance", 0))
                or not set(req.get("needs", [])) <= feats
                or "event" not in room["allowed_uses"]):
            raise HTTPException(409, "room does not satisfy the request's "
                                     "type/capacity/features")

    decision = body.model_dump(exclude_none=True)
    state.log(db, user.email, "booking.decided",
              {"request_id": request_id, "status": body.status,
               "reason": body.reason})
    if request_id.startswith("MB-"):
        row = db.get(ManualBooking, int(request_id.split("-")[1]))
        row.status = body.status
        row.decision = json.dumps(decision)
        db.commit()
    else:
        overrides = state.get_json(db, "dataset_booking_overrides", {})
        overrides[request_id] = decision
        state.set_json(db, "dataset_booking_overrides", overrides)
    scheduler_service.rebook(db)
    return {"ok": True, "request_id": request_id, "status": body.status}
