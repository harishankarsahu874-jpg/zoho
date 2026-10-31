from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..ai import service as aisvc
from ..database import get_db
from ..services import state
from .deps import get_current_user, require_role

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AskBody(BaseModel):
    question: str


class ExplainTarget(BaseModel):
    kind: str  # session | booking
    id: str


@router.get("/status")
def status(_user=Depends(get_current_user)):
    from ..ai.llm_client import llm_available
    return {"llm_configured": llm_available(),
            "note": "LLM is used only for language understanding and "
                    "explanations; every decision is validated by code."}


@router.post("/ask")
def ask(body: AskBody, db: Session = Depends(get_db),
        _user=Depends(get_current_user)):
    data = state.get_dataset(db)
    ctx = state.get_ctx(db)
    sol = state.get_solution(db)
    out = aisvc.ask(data, ctx, sol, body.question)
    state.log(db, _user.email, "ai.ask", {"question": body.question})
    return out


@router.post("/explain")
def explain(body: ExplainTarget, db: Session = Depends(get_db),
            _user=Depends(get_current_user)):
    data = state.get_dataset(db)
    ctx = state.get_ctx(db)
    sol = state.get_solution(db)
    if sol is None:
        raise HTTPException(409, "no timetable yet")
    if body.kind == "booking":
        out = aisvc.explain_booking(data, ctx, sol, body.id)
    elif body.kind == "session":
        out = aisvc.explain_session(data, ctx, sol, body.id)
    else:
        raise HTTPException(422, "kind must be 'session' or 'booking'")
    state.log(db, _user.email, "ai.explain",
              {"kind": body.kind, "id": body.id})
    return out


@router.post("/change")
def nl_change(body: AskBody, db: Session = Depends(get_db),
              user=Depends(get_current_user)):
    """Natural-language schedule change request (e.g. 'Dr. X is on leave
    Monday morning', 'Room Y is under maintenance Friday'). Parsed into a
    structured change request; the proposal is computed by the solver and an
    admin approves it. The LLM never touches the schedule directly."""
    from ..ai.change_parser import parse_change_text
    ctx = state.get_ctx(db)
    res = parse_change_text(ctx, body.question)
    if not res.get("changes"):
        return {"ok": False, "follow_up": res.get("follow_up",
                                                 "I could not map that to a "
                                                 "schedule change."),
                "llm_used": res.get("llm_used", False)}
    from ..models import ChangeRequest
    from .changes import start_proposal
    import json
    row = ChangeRequest(payload=json.dumps({"changes": res["changes"]}),
                        created_by=user.email)
    db.add(row)
    db.commit()
    state.log(db, user.email, "ai.change_requested",
              {"change_id": row.id, "changes": res["changes"]})
    prop = start_proposal(row.id, res["changes"])
    return {"ok": True, "change_id": row.id, "changes": res["changes"],
            "summary": res.get("summary", ""),
            "llm_used": res.get("llm_used", False),
            "job_id": prop["job_id"],
            "message": "Change request recorded. A proposal with the "
                       "least-moves repair is being computed; an admin will "
                       "approve or reject it on the Changes page."}
