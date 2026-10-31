"""Orchestrates the solver pipeline for the web app.

Every solution produced here goes through the official validator before it is
accepted; manual bookings and dataset bookings share the same decision layer.
"""
from __future__ import annotations

import json
from collections import defaultdict

from sqlalchemy.orm import Session

from ..dataset.models import Context, apply_disruption
from ..solver.bookings import _candidate_rooms, _cell_free, decide_bookings
from ..solver.pipeline import build_schedule, build_schedule_after
from ..validation import checks
from . import state


def assign_of(schedule: dict) -> dict:
    """{sid: (day, start, room)} from a schedule.json-shaped dict."""
    return {e["session_id"]: (e["day"], e["start_period"], e["room_id"])
            for e in schedule.get("sessions", [])}


def _manual_reserves(approved_manuals: list[dict], ctx: Context):
    reserve: set[tuple[str, str, int]] = set()
    group_free: set[tuple[str, str, int]] = set()
    for mb in approved_manuals:
        d = mb.get("decision", {})
        if not d.get("room_id"):
            continue
        a, b = d.get("start_period"), d.get("end_period")
        if not (a and b):
            continue
        for p in range(a, b + 1):
            reserve.add((d["room_id"], d["day"], p))
        for g in (mb.get("payload", {}) or {}).get("mandatory_for_groups", []):
            for p in range(a, b + 1):
                group_free.add((g, d["day"], p))
    return frozenset(reserve), frozenset(group_free)


def _attach_manuals(fest: dict, approved: list[dict], ctx: Context,
                    week_assign: dict) -> list[str]:
    """Verify approved manual bookings against the final week view and append
    their decisions to fest['bookings']. Returns problem notes.

    room_busy here = regular sessions + approved dataset bookings, so a manual
    booking can never silently overlap a Spectra-week event either."""
    from ..solver.bookings import room_busy_of
    problems = []
    room_busy = room_busy_of(ctx, week_assign)
    for d in fest.get("bookings", []):
        if d.get("status") in ("approved", "alternative_offered") and d.get("room_id"):
            for p in range(d.get("start_period", 0), d.get("end_period", 0) + 1):
                room_busy.setdefault((d["room_id"], d["day"], p), []).append(
                    d.get("request_id"))
    week_grp = checks.grp_occ_of(ctx, week_assign)
    for mb in approved:
        d = mb.get("decision", {})
        rid, day = d.get("room_id"), d.get("day")
        a, b = d.get("start_period"), d.get("end_period")
        payload = mb.get("payload", {}) or {}
        req = {"mandatory_for_groups": payload.get("mandatory_for_groups", []),
               "duration_periods": payload.get("duration_periods", 1)}
        ok, blocker = _cell_free(ctx, room_busy, week_grp, rid, day,
                                 range(a, b + 1), req)
        entry = {"request_id": f"MB-{mb['id']}", "status": "approved",
                 "day": day, "start_period": a, "end_period": b, "room_id": rid,
                 "manual": True,
                 "reason": f"Manual booking by {mb.get('created_by', 'admin')}: "
                           f"{payload.get('title', '')}"}
        if not ok:
            entry["status"] = "rejected"
            entry["reason"] = f"Could not be kept: {blocker} (timetable changed)"
            problems.append(entry["reason"])
        fest["bookings"].append(entry)
    return problems


def generate(db: Session, time_limit: float = 120.0) -> dict:
    """Full pipeline on the current dataset. Stores + returns the solution."""
    data = state.get_dataset(db)
    ctx = Context.build(data)
    team = get_team(db)

    approved = [mb for mb in state.manual_bookings(db)
                if mb["status"] == "approved"]
    reserve, group_free = _manual_reserves(approved, ctx)

    # reservation loop mirrors the pipeline but honours manual bookings
    from ..solver.timetable import solve_timetable
    from ..solver.local_search import polish_timetable
    from ..solver.pipeline import _reservation_needs, assemble_schedule
    from ..solver.exams import solve_exams
    from ..solver.local_search import polish_exams

    reserve |= frozenset(reserve)
    group_free |= frozenset(group_free)
    assign = fest = None
    overrides = state.get_json(db, "dataset_booking_overrides", {})
    for _round in range(3):
        assign, _meta = solve_timetable(ctx, reserve, group_free, baseline=None,
                                        time_limit=time_limit)
        assign, _soft = polish_timetable(ctx, assign, time_limit=15.0)
        fest, bmeta = decide_bookings(ctx, assign, extra_busy=frozenset(reserve),
                                      overrides=overrides)
        if bmeta["violations"]:
            raise RuntimeError(f"booking layer produced violations: "
                               f"{bmeta['violations'][:5]}")
        new_res, new_gf = _reservation_needs(ctx, assign, fest)
        if not (new_res - reserve) and not (new_gf - group_free):
            break
        reserve |= new_res
        group_free |= new_gf

    problems = _attach_manuals(fest, approved, ctx, assign)
    exams = solve_exams(ctx)
    exams, _ = polish_exams(ctx, exams, time_limit=10.0)
    sched = assemble_schedule(data, team, assign, fest, exams)

    report = checks.validate(data, sched)
    if report["hard_violation_count"]:
        raise RuntimeError("generated schedule failed validation: "
                           f"{report['hard_violations'][:5]}")
    state.set_solution(db, sched)
    state.log(db, "system", "timetable.generated",
              {"soft_total": report["soft_total"],
               "bookings": report.get("bookings", {}),
               "manual_problems": problems})
    return {"report": report, "solution_id": len(sched["sessions"])}


def get_team(db: Session) -> str:
    from ..config import get_settings
    return get_settings().team_name


def rebook(db: Session) -> dict:
    """Fast re-decision of dataset bookings against the current solution
    (used after a manual booking decision; no timetable re-solve)."""
    sol = state.get_solution(db)
    if not sol:
        raise RuntimeError("no timetable yet - generate one first")
    data = state.get_dataset(db)
    ctx = Context.build(data)
    assign = state.get_solution_assign(db)
    overrides = state.get_json(db, "dataset_booking_overrides", {})
    reserve = _manual_reserves(
        [mb for mb in state.manual_bookings(db) if mb["status"] == "approved"], ctx)
    fest, meta = decide_bookings(ctx, assign, extra_busy=frozenset(reserve[0]),
                                 overrides=overrides)
    approved = [mb for mb in state.manual_bookings(db) if mb["status"] == "approved"]
    _attach_manuals(fest, approved, ctx, assign)
    sol["fest_week"] = fest
    state.set_solution(db, sol)
    return {"stats": meta["stats"]}


def propose_change(db: Session, changes: list[dict],
                   time_limit: float = 180.0) -> dict:
    """Apply `changes` (dataset change-file shape) to the current dataset and
    produce the least-moves repair of the current solution.

    Approved manual bookings and manual dataset-booking decisions are carried
    across the repair so an admin approval never wipes them out."""
    data = state.get_dataset(db)
    team = get_team(db)
    disrupted = apply_disruption(data, {"changes": changes})
    ctx = Context.build(disrupted)
    baseline = state.get_solution(db)

    approved = [mb for mb in state.manual_bookings(db) if mb["status"] == "approved"]
    reserve, group_free = _manual_reserves(approved, ctx)
    overrides = state.get_json(db, "dataset_booking_overrides", {})

    if baseline is None:
        # no baseline: generate fresh under the disrupted dataset
        sched, report, _ = build_schedule(ctx, team,
                                          time_limit=max(60.0, time_limit / 2),
                                          extra_busy=frozenset(reserve),
                                          overrides=overrides,
                                          initial_reserve=reserve,
                                          initial_group_free=group_free)
        assign = assign_of(sched)
        _attach_manuals(sched["fest_week"], approved, ctx, assign)
        return {"schedule": sched, "stability": {"sessions_moved": 0},
                "moved_from": {}, "report": report, "infeasible": False}
    sched, report, meta = build_schedule_after(ctx, baseline, team,
                                               time_limit=time_limit,
                                               extra_busy=frozenset(reserve),
                                               overrides=overrides,
                                               initial_reserve=reserve,
                                               initial_group_free=group_free)
    assign = assign_of(sched)
    _attach_manuals(sched["fest_week"], approved, ctx, assign)
    # re-validate with manual entries in place
    report = checks.validate(disrupted, sched, baseline=baseline)
    if report["hard_violation_count"]:
        raise RuntimeError("repair failed validation: "
                           f"{report['hard_violations'][:5]}")
    moved_from = {
        e["session_id"]: (e["day"], e["start_period"], e["room_id"])
        for e in baseline.get("sessions", [])
        if e["session_id"] in (report.get("stability", {}).get("moved_ids") or [])
    }
    return {"schedule": sched, "stability": report.get("stability", {}),
            "moved_from": moved_from, "report": report, "infeasible": False}


def apply_change(db: Session, changes: list[dict]) -> None:
    data = state.get_dataset(db)
    state.set_dataset(db, apply_disruption(data, {"changes": changes}))
    sol = state.get_solution(db)
    if sol is None:
        return
    # after applying, the solution must match the new dataset's session set
    assign = state.get_solution_assign(db)
    valid_sids = {s["id"] for s in state.get_dataset(db)["sessions"]}
    removed = [sid for sid in assign if sid not in valid_sids]
    for sid in removed:
        del assign[sid]
    sol["sessions"] = [{"session_id": sid, "day": d, "start_period": p, "room_id": r}
                       for sid, (d, p, r) in sorted(assign.items())]
    state.set_solution(db, sol)
