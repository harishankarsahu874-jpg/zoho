"""Deterministic validity checks.

Validity in this system is decided ONLY by code — never by an LLM. We reuse the
official validator (shared with every team, unmodified) as the single source of
truth so our internal checks can never drift from what the judges run.

This module is the guardrail every AI-generated or user-generated proposal must
pass through before it may change any data.
"""
from __future__ import annotations

import importlib.util
import sys
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = REPO_ROOT / "validator" / "validator.py"


@lru_cache(maxsize=1)
def _validator_module():
    spec = importlib.util.spec_from_file_location("cw_official_validator", str(VALIDATOR_PATH))
    mod = importlib.util.module_from_spec(spec)
    sys.modules["cw_official_validator"] = mod
    spec.loader.exec_module(mod)
    return mod


def validate(data: dict, schedule: dict, baseline: dict | None = None) -> dict:
    """Full report for a schedule.json-shaped dict (same output as CLI run)."""
    v = _validator_module()
    return v.run(data, schedule, baseline)


def hard_violations(data: dict, schedule: dict, baseline: dict | None = None) -> list[dict]:
    return validate(data, schedule, baseline).get("hard_violations", [])


def is_valid(data: dict, schedule: dict, baseline: dict | None = None) -> bool:
    return len(hard_violations(data, schedule, baseline)) == 0


def check_assignment(ctx, assign: dict) -> list[dict]:
    """Hard-check a partial/complete timetable assignment {sid: (day, start, room)}."""
    v = _validator_module()
    viols, _grp_occ = v.check_timetable(ctx, assign, "check")
    return viols


def grp_occ_of(ctx, assign: dict) -> dict:
    """Occupancy map (group, day, period) -> set of basket-keys (validator semantics)."""
    v = _validator_module()
    _viols, grp_occ = v.check_timetable(ctx, assign, "check")
    return grp_occ


def soft_report(ctx, assign: dict) -> dict:
    """Soft penalty breakdown + total (validator semantics)."""
    v = _validator_module()
    pen, total = v.soft_score(ctx, assign)
    return {"penalties": pen, "total": total}


def booking_report(ctx, base_assign: dict, fest: dict) -> dict:
    """Bookings check: violations, warnings, stats (validator semantics)."""
    v = _validator_module()
    viols, warns, stats = v.check_bookings(ctx, base_assign, fest)
    return {"violations": viols, "warnings": warns, "stats": stats}


def sessions_week_grid(ctx, assign: dict) -> dict:
    """{f'{day}|P{p}': [{sid, room, dur, kind}, ...]} teaching grid (occupancy)."""
    grid: dict[str, list] = {}
    for sid, (day, start, room) in assign.items():
        meta = ctx.sessions.get(sid)
        if meta is None:
            continue
        dur = int(meta.get("duration", 1) or 1)
        kind = "lab" if str(meta.get("kind", "")).startswith("practical") \
            or str(meta.get("kind", "")).endswith("lab") else "lecture"
        for p in range(start, start + dur):
            grid.setdefault(f"{day}|P{p}", []).append(
                {"sid": sid, "room": room, "dur": dur, "kind": kind})
    return grid


def room_cells(ctx) -> dict:
    """All bookable teaching cells (room, day, period) -> None (P1..P9 only)."""
    cells = {}
    for rid in ctx.rooms:
        for day in ctx.days:
            for p in range(1, 10):
                cells[(rid, day, p)] = None
    return cells
