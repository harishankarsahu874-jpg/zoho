"""Central application state: live dataset + current solution + demo reset.

The state is persisted in SQLite (kv_state) so the deployed demo survives
restarts; Admin's "Reset demo data" restores the pristine starter-pack
dataset and clears all derived state.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import DEFAULT_DATASET, get_settings
from ..dataset.models import Context, apply_disruption, load_json
from ..models import KVState, User
from ..validation import checks

_lock = threading.Lock()

DEMO_ACCOUNTS = [
    # (email, password, role, name)
    ("admin@cit.edu.in", "Admin@123", "admin", "Dr. Meera Nair (Dean's office)"),
    ("coordinator@cit.edu.in", "Coord@123", "department_coordinator",
     "Prof. A. K. Sahu (CSE coordinator)"),
    ("faculty@cit.edu.in", "Faculty@123", "faculty", "Dr. F. Demo (faculty)"),
    ("club@cit.edu.in", "Club@123", "club", "R. Member (Dramatics Society)"),
]


def _hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def _get(db: Session, key: str) -> str | None:
    row = db.get(KVState, key)
    return row.value if row else None


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(KVState, key)
    if row is None:
        db.add(KVState(key=key, value=value))
    else:
        row.value = value
    db.commit()


def get_kv(db: Session, key: str) -> str | None:
    return _get(db, key)


def set_kv(db: Session, key: str, value: str) -> None:
    _set(db, key, value)


def get_json(db: Session, key: str, default=None):
    raw = _get(db, key)
    return json.loads(raw) if raw else default


def set_json(db: Session, key: str, value) -> None:
    _set(db, key, json.dumps(value))


# -------------------------------------------------------------------------- users
def seed_users(db: Session) -> None:
    for email, password, role, name in DEMO_ACCOUNTS:
        if db.query(User).filter(User.email == email).first() is None:
            db.add(User(email=email, password_hash=_hash_password(password),
                        role=role, name=name))
    db.commit()


def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode()[:72], hashed.encode())
    except ValueError:
        return False


# -------------------------------------------------------------------------- state
def get_dataset(db: Session) -> dict:
    raw = _get(db, "dataset")
    if raw is None:
        data = load_json(DEFAULT_DATASET)
        _set(db, "dataset", json.dumps(data))
        return data
    return json.loads(raw)


def set_dataset(db: Session, data: dict) -> None:
    _set(db, "dataset", json.dumps(data))


def get_solution(db: Session) -> dict | None:
    raw = _get(db, "solution")
    return json.loads(raw) if raw else None


def set_solution(db: Session, solution: dict | None) -> None:
    if solution is None:
        row = db.get(KVState, "solution")
        if row:
            db.delete(row)
            db.commit()
    else:
        _set(db, "solution", json.dumps(solution))


def get_ctx(db: Session) -> Context:
    return Context.build(get_dataset(db))


def get_solution_assign(db: Session) -> dict:
    """{sid: (day, start, room)} from the stored solution, or {}."""
    sol = get_solution(db)
    if not sol:
        return {}
    return {e["session_id"]: (e["day"], e["start_period"], e["room_id"])
            for e in sol.get("sessions", [])}


def solution_exists(db: Session) -> bool:
    return _get(db, "solution") is not None


# -------------------------------------------------------------------------- reset
def reset_demo(db: Session) -> None:
    """Restore pristine dataset + demo accounts; drop solution/requests/jobs."""
    with _lock:
        from ..models import ChangeRequest, ManualBooking, AuditLog
        db.query(ChangeRequest).delete()
        db.query(ManualBooking).delete()
        db.query(AuditLog).delete()
        set_dataset(db, load_json(DEFAULT_DATASET))
        set_solution(db, None)
        seed_users(db)


# -------------------------------------------------------------------------- audit
def log(db: Session, actor: str, action: str, detail: dict | None = None) -> None:
    from ..models import AuditLog
    db.add(AuditLog(actor=actor, action=action, detail=json.dumps(detail or {})))
    db.commit()


# -------------------------------------------------------------------------- manual bookings
def manual_bookings(db: Session) -> list[dict]:
    from ..models import ManualBooking
    out = []
    for row in db.query(ManualBooking).order_by(ManualBooking.id).all():
        out.append({"id": row.id, "payload": json.loads(row.payload),
                    "status": row.status,
                    "decision": json.loads(row.decision or "{}"),
                    "created_by": row.created_by})
    return out


def manual_booking_decisions(db: Session) -> dict:
    """{request_id: decision} for decided manual bookings, dataset-shape ids."""
    out = {}
    for mb in manual_bookings(db):
        if mb["status"] in ("approved", "rejected", "alternative_offered"):
            dec = dict(mb["decision"])
            dec["request_id"] = f"MB-{mb['id']}"
            dec["status"] = mb["status"]
            out[f"MB-{mb['id']}"] = dec
    return out


def validate_manual_booking(ctx: Context, payload: dict, decisions_so_far: list[dict]) -> list[str]:
    """Hard-constraint pre-check for a manual booking draft. Returns problems."""
    problems = []
    if not payload.get("title"):
        problems.append("missing title")
    if not payload.get("windows"):
        problems.append("missing time window(s)")
    att = int(payload.get("attendance", 0))
    if att <= 0:
        problems.append("missing/invalid attendance")
    dur = int(payload.get("duration_periods", 0))
    if dur <= 0:
        problems.append("missing/invalid duration")
    rooms_ok = False
    for rid, r in ctx.rooms.items():
        if "event" in r["allowed_uses"] and r["type"] in payload.get("room_types", []):
            feats = set(r["features"]) | ({"accessible"} if r["accessible"] else set())
            if r["capacity"] >= att and set(payload.get("needs", [])) <= feats:
                rooms_ok = True
                break
    if not rooms_ok:
        problems.append("no room matches the requested type/features/capacity "
                        "(adjust types or size, or it will be rejected)")
    for w in payload.get("windows", []):
        if w.get("day") not in ctx.days:
            problems.append(f"unknown day {w.get('day')}")
        if not (1 <= w.get("from_period", 0) <= w.get("to_period", 0) <= 13):
            problems.append(f"invalid window periods {w}")
    return problems
