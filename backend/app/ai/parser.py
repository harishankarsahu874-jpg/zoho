"""Deterministic plain-language booking parser (English + Hinglish).

Works with or without the LLM: the LLM (when available) produces a structured
draft which is then normalised and validated here; without the LLM this module
parses the text directly. In both cases the output is only a *draft* — the
user reviews/edits it, and hard-constraint validation happens server-side.
"""
from __future__ import annotations

import json
import re

from ..dataset.models import Context
from .llm_client import LLMUnavailable, chat

DAY_WORDS = {
    "mon": "MON", "monday": "MON", "tue": "TUE", "tuesday": "TUE",
    "wed": "WED", "wednesday": "WED", "thu": "THU", "thursday": "THU",
    "fri": "FRI", "friday": "FRI", "mondays": "MON", "tuesdays": "TUE",
    "wednesdays": "WED", "thursdays": "THU", "fridays": "FRI",
    "somvaar": "MON", "somvar": "MON", "mann": "MON", "soam": "MON",
    "mangal": "TUE", "angles": "WED", "budh": "WED", "barasobar": "WED",
    "guru": "THU", "vibraar": "THU", "vibrahar": "THU", "shukra": "FRI",
    "shukravvar": "FRI", "raav": "SAT", "shani": "SAT",
}

FEATURE_WORDS = {
    "projector": "projector", "screen": "projector",
    "mic": "pa_system", "mics": "pa_system", "microphone": "pa_system",
    "pa": "pa_system", "sound": "pa_system", "speaker": "pa_system",
    "stage": "stage",
    "lab": "computers", "computer": "computers", "computers": "computers",
    "laptop": "computers",
    "wheelchair": "accessible", "accessible": "accessible",
    "ac": "ac", "a/c": "ac",
    "benches": "power_benches",
}

ROOM_TYPE_HINTS = {
    "auditorium": ["auditorium"],
    "seminar": ["seminar_hall"],
    "hall": ["lecture_hall"],
    "lecture hall": ["lecture_hall"],
    "classroom": ["classroom"],
    "class room": ["classroom"],
    "open-air": ["outdoor"], "open air": ["outdoor"], "outdoor": ["outdoor"],
    "garden": ["outdoor"],
    "cs lab": ["lab_cs"], "computer lab": ["lab_cs"], "coding": ["lab_cs"],
    "elec": ["lab_elec"], "electronics": ["lab_elec"],
    "physics lab": ["lab_phy"], "phy lab": ["lab_phy"],
    "workshop": ["workshop"], "civil": ["lab_civil"],
}


def _h_to_period(h: int) -> int:
    """Hour -> start period (P1=08:00 ... P13=21:00)."""
    return h - 7


def _periods_from_text(text: str) -> tuple[int | None, int | None, str | None]:
    """Extract (from_period, to_period, day) from phrases like
    '6 to 8 pm', 'kal shaam 6 baje, 2 ghante', '10 am', 'periods 4-5'."""
    low = text.lower()
    day = None
    for w, d in DAY_WORDS.items():
        if re.search(rf"\b{re.escape(w)}\b", low):
            day = d
            break
    # 1) period-range shorthand FIRST: "P4-5", "period(s) 4 to 5"
    m = re.search(r"\b(?:p|periods?)\s?(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\b", low)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= 13 and 1 <= b <= 13 and b >= a:
            return a, b, day
    # 2) explicit time range "6 to 8 pm" / "11 am to 1 pm" / "10 baje se 11 baje"
    m = re.search(r"\b(\d{1,2})(?::\d{2})?\s*(am|pm|baje|baaje)?\s*"
                  r"(?:to|until|tak|se)\s*(\d{1,2})(?::\d{2})?\s*"
                  r"(am|pm|baje|baaje)?\b", low)
    if m:
        h1, a1, h2, a2 = int(m.group(1)) % 12, m.group(2), int(m.group(3)) % 12, m.group(4)
        if a1 in ("baje", "baaje"):
            a1 = None
        if a2 in ("baje", "baaje"):
            a2 = None
        if a1 is None and a2 is not None:
            a1 = a2
        if a2 is None and a1 is not None:
            a2 = a1
        if a1 is None and a2 is None:
            a1 = a2 = "pm" if h1 <= 6 else "am"  # bare hours: early => afternoon
        if a1 == "pm":
            h1 = h1 % 12 + 12
        elif a1 == "am":
            h1 = h1 % 12
        else:
            h1 = h1 if h1 else 12
        if a2 == "pm":
            h2 = h2 % 12 + 12
        elif a2 == "am":
            h2 = h2 % 12
        elif a2 is None:
            h2 = (h2 % 12) + (12 if h2 < h1 else 0)
        to_p, end_p = _h_to_period(h1), h2 - 8
        if 1 <= to_p <= 13 and 1 <= end_p <= 13 and end_p >= to_p:
            return to_p, end_p, day
    # 3) single time + duration "6 pm 2 ghante" / "10 am, 2 hours"
    m = re.search(r"\b(\d{1,2})(?::\d{2})?\s*(am|pm|baje|baaje)?\b", low)
    if m:
        h = int(m.group(1)) % 12
        ap = m.group(2)
        if ap in ("baje", "baaje"):
            ap = None  # bare Hindi marker - am/pm from context words
        evening = bool(re.search(r"\b(evening|shaam|raat|night|pm)\b", low))
        morning = bool(re.search(r"\b(morning|subah|subaah)\b", low))
        marker = ap is not None
        if ap == "pm" or (ap is None and evening and not morning):
            h += 12
        elif ap == "am" or (ap is None and morning and not evening and h < 8):
            pass
        elif not marker and not evening and not morning:
            return None, None, day  # ambiguous - ask follow-up
        dur = _parse_duration(low)
        to_p = _h_to_period(h)
        if 1 <= to_p <= 13:
            end_p = min(to_p + (dur or 1) - 1, 13)
            return to_p, end_p, day
    # 4) word-of-day hints (no exact time)
    if re.search(r"\b(evening|shaam|raat|night)\b", low):
        return 10, 13, day
    if re.search(r"\b(morning|subah|subaah)\b", low):
        return 1, 5, day
    if re.search(r"\bafternoon\b", low):
        return 6, 9, day
    return None, None, day


def _parse_size(text: str) -> int | None:
    m = re.search(r"\b(\d{2,4})\s*(?:people|log|persons|students|participants|logon|lakh)?\b",
                  text.lower())
    if m:
        v = int(m.group(1))
        if 1 <= v <= 2000:
            return v
    return None


def _parse_duration(text: str) -> int | None:
    m = re.search(r"\b(\d{1,2})\s*(?:ghante|hours?|hrs?)\b", text.lower())
    if m:
        return max(1, int(m.group(1)))
    m = re.search(r"\b(\d{1,2})\s*(?:periods?|slots?)\b", text.lower())
    if m:
        return max(1, int(m.group(1)))
    return None


def _parse_features(text: str) -> list[str]:
    low = text.lower()
    feats = set()
    for w, f in FEATURE_WORDS.items():
        if re.search(rf"\b{re.escape(w)}\b", low):
            feats.add(f)
    return sorted(feats)


def _parse_room_types(text: str) -> list[str]:
    low = text.lower()
    types = set()
    for w, ts in ROOM_TYPE_HINTS.items():
        if re.search(rf"\b{re.escape(w)}\b", low):
            types.update(ts)
    return sorted(types) or ["classroom", "lecture_hall", "auditorium",
                             "seminar_hall", "outdoor"]


def _requested_room(ctx: Context, text: str) -> str | None:
    low = text.lower()
    for rid in ctx.rooms:
        if rid.lower() in low:
            return rid
    return None


def parse_booking_text(ctx: Context, text: str) -> dict:
    """Return a draft booking dict: {payload, follow_up, llm_used}."""
    follow_up = []
    llm_used = False
    payload = None
    try:
        raw = chat([
            {"role": "system", "content": (
                "You convert venue booking requests for a college into strict JSON. "
                "Output ONLY JSON: {\"title\": str|null, \"attendance\": int|null, "
                "\"duration_periods\": int|null, \"room_types\": [..] from "
                "[classroom, lecture_hall, auditorium, seminar_hall, outdoor, "
                "lab_cs, lab_elec, lab_phy, workshop, lab_civil], "
                "\"needs\": [..] from [projector, pa_system, stage, computers, "
                "accessible, ac, power_benches], \"day\": MON|TUE|WED|THU|FRI|null, "
                "\"from_period\": int 1-13|null, \"to_period\": int 1-13|null, "
                "\"requested_room\": str|null, \"role\": club|faculty|"
                "department_coordinator|admin}. Periods: P1=08:00 ... P9=17:00, "
                "P10=18:00 ... P13=22:00. Text may be English or Hinglish. "
                "Unknown fields: null.")},
            {"role": "user", "content": text},
        ])
        payload = json.loads(re.sub(r"```(?:json)?|```", "", raw).strip())
        llm_used = True
    except (LLMUnavailable, json.JSONDecodeError, KeyError):
        payload = None

    if payload is None:
        a, b, day = _periods_from_text(text)
        payload = {
            "title": None,
            "attendance": _parse_size(text),
            "duration_periods": _parse_duration(text),
            "room_types": _parse_room_types(text),
            "needs": _parse_features(text),
            "day": day,
            "from_period": a,
            "to_period": b,
            "requested_room": _requested_room(ctx, text),
            "role": "club",
        }

    # normalise + fill defaults
    day = payload.get("day")
    a, b = payload.get("from_period"), payload.get("to_period")
    dur = payload.get("duration_periods")
    if day and a and not b:
        b = min(a + (dur or 1) - 1, 13)
    if day and a and b:
        if not dur:
            dur = b - a + 1
        windows = [{"day": day, "from_period": a, "to_period": b}]
    else:
        windows = []
        if not day:
            follow_up.append("Which day? (Monday-Friday)")
        if not a or not b:
            follow_up.append("What time? e.g. 'Thursday 6 to 8 pm' or 'periods 4-5'")
    if not payload.get("attendance"):
        follow_up.append("How many people will attend?")
    if not payload.get("title"):
        title = text.strip().split(".")[0][:80]
        payload["title"] = title if len(title) > 8 else "Untitled request"

    out = {
        "title": payload.get("title"),
        "role": payload.get("role") or "club",
        "requested_category": "club_event",
        "attendance": int(payload["attendance"]) if payload.get("attendance") else None,
        "duration_periods": int(dur) if dur else (b - a + 1 if (a and b) else None),
        "windows": windows,
        "room_types": payload.get("room_types") or ["classroom", "lecture_hall",
                                                    "auditorium", "seminar_hall"],
        "needs": payload.get("needs") or [],
        "requested_room": payload.get("requested_room"),
        "mandatory_for_groups": payload.get("mandatory_for_groups") or [],
        "raw_text": text,
    }
    return {"payload": out, "follow_up": follow_up, "llm_used": llm_used}
