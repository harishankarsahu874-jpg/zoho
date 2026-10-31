"""Natural-language change request parser.

Turns sentences like 'Dr. F07 is on leave all of Monday' or 'CR-102 is under
maintenance Thursday periods 6-9' into the dataset change-file format. Output
is a *proposal* only - it never modifies data; the solver computes the repair
and an admin approves it.
"""
from __future__ import annotations

import json
import re

from ..dataset.models import Context
from .llm_client import LLMUnavailable, chat

VALID_TYPES = {"faculty_unavailable", "room_unavailable", "add_session",
               "remove_session"}


def _fill_with_rules(ctx: Context, text: str) -> list[dict]:
    low = text.lower()
    changes: list[dict] = []
    day_re = r"(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?)"

    # faculty unavailable: '<F..> is on leave <day(s)>' / '<faculty> <day> morning'
    for m in re.finditer(r"\b(F\d{2,3})\b", text):
        fid = m.group(1)
        if fid not in ctx.fac:
            continue
        days = []
        for dm in re.finditer(day_re, low):
            d = dm.group(1)[:3].upper()
            if d in ctx.days and d not in days:
                days.append(d)
        if days:
            periods = list(range(1, 10))
            if re.search(r"\b(morning|subah)\b", low):
                periods = [1, 2, 3]
            elif re.search(r"\b(evening|shaam)\b", low):
                periods = [10, 11, 12, 13]
            changes.append({"type": "faculty_unavailable", "faculty_id": fid,
                            "days": days, "periods": periods,
                            "reason": text.strip()[:160]})
            break
    # room unavailable: '<room id> is under maintenance / unavailable <day>'
    for rid, _r in ctx.rooms.items():
        if re.search(rf"\b{re.escape(rid)}\b", text, re.IGNORECASE):
            days = []
            for dm in re.finditer(day_re, low):
                d = dm.group(1)[:3].upper()
                if d in ctx.days and d not in days:
                    days.append(d)
            periods = list(range(1, 10))
            pm = re.search(r"periods?\s*(\d{1,2})\s*[-to]\s*(\d{1,2})", low)
            if pm:
                a, b = int(pm.group(1)), int(pm.group(2))
                periods = list(range(a, min(b, 13) + 1))
            elif re.search(r"\b(morning|subah)\b", low):
                periods = [1, 2, 3]
            elif re.search(r"\b(evening|shaam)\b", low):
                periods = [10, 11, 12, 13]
            if days:
                changes.append({"type": "room_unavailable", "room_id": rid,
                                "days": days, "periods": periods,
                                "reason": text.strip()[:160]})
            break
    # remove session: 'remove/cancel <session id>'
    m = re.search(r"\b([A-Z]{2,5}\d{3}-[A-Z]{1,3}-\d{2})\b", text)
    if m and re.search(r"\b(remove|cancel|delete)\b", low):
        sid = m.group(1)
        if sid in ctx.sessions:
            changes.append({"type": "remove_session", "session_id": sid})
    return changes


def parse_change_text(ctx: Context, text: str) -> dict:
    changes: list[dict] | None = None
    llm_used = False
    try:
        raw = chat([
            {"role": "system", "content": (
                "Convert a university schedule change request into strict JSON: "
                "{\"changes\":[...], \"summary\": str}. Each change is one of: "
                "{\"type\":\"faculty_unavailable\",\"faculty_id\":\"F..\",\"days\":"
                "[MON..FRI],\"periods\":[ints],\"reason\":str}, "
                "{\"type\":\"room_unavailable\",\"room_id\":str,\"days\":[...],"
                "\"periods\":[ints],\"reason\":str}, "
                "{\"type\":\"remove_session\",\"session_id\":str}, "
                "{\"type\":\"add_session\",\"session\":{...}}. "
                "Unknown ids: output empty changes. Output ONLY JSON.")},
            {"role": "user", "content": text},
        ])
        data = json.loads(re.sub(r"```(?:json)?|```", "", raw).strip())
        cand = data.get("changes") or []
        clean = []
        for c in cand:
            if not isinstance(c, dict) or c.get("type") not in VALID_TYPES:
                continue
            if c["type"] == "faculty_unavailable" and c.get("faculty_id") in ctx.fac:
                clean.append(c)
            elif c["type"] == "room_unavailable" and c.get("room_id") in ctx.rooms:
                clean.append(c)
            elif c["type"] == "remove_session" and c.get("session_id") in ctx.sessions:
                clean.append(c)
            elif c["type"] == "add_session" and isinstance(c.get("session"), dict) \
                    and c["session"].get("id"):
                clean.append(c)
        if clean:
            changes = clean
            llm_used = True
    except (LLMUnavailable, json.JSONDecodeError, KeyError, TypeError):
        changes = None
    if not changes:
        changes = _fill_with_rules(ctx, text)
        llm_used = False
    return {"changes": changes, "llm_used": llm_used,
            "summary": "; ".join(_describe(c) for c in changes)}


def _describe(c: dict) -> str:
    t = c.get("type")
    if t == "faculty_unavailable":
        return f"{c['faculty_id']} unavailable {','.join(c.get('days', []))} " \
               f"periods {c.get('periods')}"
    if t == "room_unavailable":
        return f"room {c['room_id']} unavailable {','.join(c.get('days', []))} " \
               f"periods {c.get('periods')}"
    if t == "remove_session":
        return f"remove session {c.get('session_id')}"
    if t == "add_session":
        return f"add session {c.get('session', {}).get('id')}"
    return t or "change"
