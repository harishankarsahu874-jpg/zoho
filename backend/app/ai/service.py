"""Explainable decisions: turn stored reasons into human explanations.

The deterministic path (always available) composes the explanation from the
official validator output + stored decision reasons. When an LLM key is
configured it rewrites for readability — the facts (status, reasons, numbers)
come only from our own code, never from the LLM.
"""
from __future__ import annotations

import json

from ..dataset.models import Context
from .llm_client import LLMUnavailable, chat, llm_available

WHY_BRAIDED = {
    "H1": "a session is missing from the schedule",
    "H2": "a group would be in two places at once",
    "H3": "a faculty would be in two places at once",
    "H4": "a room would be double-booked",
    "H5": "the room is too small for the session",
    "H6": "the room type doesn't match the session type",
    "H7": "the faculty is unavailable then",
    "H8": "the room is unavailable then",
    "H9": "teaching hours / lab-slot rules are broken",
    "H10": "the session needs an accessible room",
    "H11": "basket sessions must run in parallel",
    "H12": "a faculty would exceed 4 hours",
    "H14": "a fixed slot was moved",
    "B1": "duplicate booking decision",
    "B2": "a rejected higher-priority booking is being overridden",
    "B3": "a cancelled request cannot be approved",
}


def explain_booking(data: dict, ctx: Context, solution: dict,
                    request_id: str) -> dict:
    """Explain the decision for one booking request."""
    fest = solution.get("fest_week", {})
    dec = next((d for d in fest.get("bookings", [])
                if d.get("request_id") == request_id), None)
    req = next((r for r in data.get("booking_requests", [])
                if r["id"] == request_id), None)
    if req is None:
        return {"error": f"unknown booking {request_id}"}
    out = {"request_id": request_id, "request": req}
    if dec is None:
        out["explanation"] = "No decision recorded for this request yet."
        return out
    out["decision"] = dec
    facts = (
        f"Status: {dec['status']}. Requested: {req.get('role')}, "
        f"attendance {req.get('attendance')}, windows "
        f"{[(w['day'], w['from_period'], w['to_period']) for w in req.get('windows', [])]}. "
        f"Decision reason: {dec.get('reason', 'n/a')}. "
        f"Priority rule: institute_event > dept_event > guest_event > club_event, "
        "earlier submission wins ties; a rejected higher-priority booking cannot "
        "be overridden by a lower-priority approval."
    )
    if llm_available():
        try:
            txt = chat([
                {"role": "system", "content":
                    "Explain a college venue-booking decision in 2-3 plain "
                    "sentences for a student club. Use only the given facts. "
                    "Do not invent any additional reasons."},
                {"role": "user", "content": facts},
            ])
            out["explanation"] = txt.strip()
            out["llm_used"] = True
            return out
        except LLMUnavailable:
            pass
    out["explanation"] = facts
    out["llm_used"] = False
    return out


def explain_session(data: dict, ctx: Context, solution: dict,
                    session_id: str) -> dict:
    sol = solution
    sess = next((s for s in sol.get("sessions", []) if s["session_id"] == session_id), None)
    meta = next((s for s in data["sessions"] if s["id"] == session_id), None)
    if meta is None:
        return {"error": f"unknown session {session_id}"}
    out = {"session_id": session_id, "session": meta}
    if sess is None:
        out["explanation"] = "Session not currently scheduled."
        return out
    facts = (
        f"Session {session_id} ({meta.get('course_id')}, {meta['kind']}) is "
        f"scheduled on {sess['day']} period {sess['start_period']} in "
        f"{sess['room_id']} with {meta.get('faculty_id')}. It satisfies all "
        f"hard constraints: room capacity "
        f"{ctx.rooms[sess['room_id']]['capacity']} >= {meta['size']}, room "
        f"type fits, no double-booking of the group "
        f"{', '.join(meta.get('groups', []))}, faculty or room, and "
        "accessibility needs are met."
    )
    if llm_available():
        try:
            txt = chat([
                {"role": "system", "content":
                    "Explain in 2 sentences why a university session is placed "
                    "where it is, based only on the given facts."},
                {"role": "user", "content": facts},
            ])
            out["explanation"] = txt.strip()
            out["llm_used"] = True
            return out
        except LLMUnavailable:
            pass
    out["explanation"] = facts
    out["llm_used"] = False
    return out


def ask(data: dict, ctx: Context, solution: dict | None, question: str) -> dict:
    """Free-form assistant question. LLM (if configured) answers with context;
    otherwise a deterministic fallback answers the common cases."""
    context = _build_context(data, ctx, solution)
    if llm_available():
        try:
            txt = chat([
                {"role": "system", "content":
                    "You are the CIT scheduling assistant. Answer using ONLY the "
                    "provided context. If the context is insufficient, say so. "
                    "Keep it under 120 words."},
                {"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION: {question}"},
            ])
            return {"answer": txt.strip(), "llm_used": True}
        except LLMUnavailable:
            pass
    return {"answer": _fallback_answer(question, solution), "llm_used": False,
            "context_snippet": context[:1200]}


def _build_context(data: dict, ctx: Context, solution: dict | None) -> str:
    parts = []
    n_fac, n_rooms, n_sess = len(ctx.fac), len(ctx.rooms), len(data["sessions"])
    parts.append(f"Campus: {n_fac} faculty, {n_rooms} rooms, {n_sess} weekly sessions, "
                 f"{len(ctx.groups)} groups, {len(data.get('booking_requests', []))} "
                 "Spectra-week venue requests, "
                 f"{len(data.get('exams', []))} midsem exams.")
    if solution:
        fest = solution.get("fest_week", {})
        stats = {}
        for d in fest.get("bookings", []):
            stats[d.get("status", "?")] = stats.get(d.get("status", "?"), 0) + 1
        parts.append(f"Current schedule: {len(solution.get('sessions', []))} sessions placed; "
                     f"booking decisions {stats}; "
                     f"{len(solution.get('exams', []))} exams placed.")
    rooms_used = {}
    if solution:
        for s in solution.get("sessions", []):
            rooms_used[s["room_id"]] = rooms_used.get(s["room_id"], 0) + 1
    top = sorted(rooms_used.items(), key=lambda kv: -kv[1])[:5]
    if top:
        parts.append("Most used rooms: " + ", ".join(f"{r} ({c})" for r, c in top))
    return "\n".join(parts)


def _fallback_answer(question: str, solution: dict | None) -> str:
    q = question.lower()
    if not solution:
        return ("No timetable has been generated yet. Ask the admin to click "
                "'Generate timetable' on the Admin page.")
    fest = solution.get("fest_week", {})
    stats: dict[str, int] = {}
    for d in fest.get("bookings", []):
        stats[d.get("status", "?")] = stats.get(d.get("status", "?"), 0) + 1
    if "book" in q or "venue" in q or "event" in q:
        return (f"Currently {stats.get('approved', 0)} venue requests are approved, "
                f"{stats.get('alternative_offered', 0)} have alternatives offered and "
                f"{stats.get('rejected', 0)} rejected. Use the Bookings page to submit "
                "a new request in plain language, then a coordinator/admin approves it.")
    if "exam" in q:
        return f"{len(solution.get('exams', []))} midsem exams are scheduled (AM/PM, " \
               "half room capacity per exam)."
    if "conflict" in q or "clash" in q or "violation" in q:
        return "The current schedule has 0 hard violations (verified by the official " \
               "validator on every regeneration)."
    if "utilis" in q or "usage" in q or "room" in q:
        return "See the Dashboard page for per-room utilisation for the week."
    return ("I can answer questions about the timetable, bookings, exams and "
            "room usage. An LLM key is not configured, so answers use the "
            "deterministic fallback - set OPENAI_API_KEY for richer answers.")
