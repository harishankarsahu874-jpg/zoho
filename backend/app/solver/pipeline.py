"""End-to-end schedule pipeline.

build_schedule:          dataset -> schedule.json (timetable + exams + fest)
build_schedule_after:    disrupted dataset + baseline schedule -> schedule_after.json

The pipeline runs a small coordination loop: the booking layer tells the
timetable solver which cells/groups to keep free (confirmed daytime bookings),
the timetable re-solves, and the bookings are re-decided until stable.
Nothing is hard-coded: every number comes from the dataset passed in.
"""
from __future__ import annotations

from ..dataset.models import Context
from ..validation import checks
from .bookings import _candidate_rooms, decide_bookings
from .exams import solve_exams
from .local_search import polish_exams, polish_timetable
from .timetable import TimetableInfeasible, solve_timetable


def _reservation_needs(ctx: Context, assign: dict, fest: dict):
    """Inspect rejected/alternative non-institute bookings and derive the
    (reserve_cells, group_free) constraints the next timetable solve needs.
    Returns (reserve, group_free) as frozensets of new cells."""
    from collections import defaultdict
    room_busy: dict[tuple, list] = defaultdict(list)
    for sid, (d, st, rid) in assign.items():
        s = ctx.sessions.get(sid)
        if s:
            for p in range(st, st + s["duration"]):
                room_busy[(rid, d, p)].append(sid)
    week_grp = checks.grp_occ_of(ctx, assign)

    reserve: set[tuple[str, str, int]] = set()
    group_free: set[tuple[str, str, int]] = set()
    for dec in fest.get("bookings", []):
        req = ctx.req.get(dec["request_id"])
        if not req or dec["request_id"] in ctx.cancelled:
            continue
        if dec["status"] not in ("rejected", "alternative_offered"):
            continue
        if ctx.effective_category(ctx.data, req) == "institute_event":
            continue  # institute events may displace; they never need reservations
        rooms = _candidate_rooms(ctx, req)
        if not rooms:
            continue  # no room can ever host it; reserving won't help
        dur = req["duration_periods"]
        # preferred placement: first room (requested first) x window x valid start
        from .bookings import _window_starts
        pref = None
        for rid in rooms:
            for w in req["windows"]:
                starts = list(_window_starts(w, dur))
                if starts:
                    pref = (rid, w["day"], starts[0])
                    break
            if pref:
                break
        if not pref:
            continue  # window can never hold the booking (e.g. beyond P13)
        rid, day, a = pref
        hard_room = False
        for p in range(a, a + dur):
            if ctx.room_unfree(rid, day, p):
                hard_room = True
                break
            if room_busy.get((rid, day, p)):
                reserve.add((rid, day, p))
            for g in req.get("mandatory_for_groups", []):
                if week_grp.get((g, day, p)):
                    group_free.add((g, day, p))
        if hard_room:
            pass  # room unavailable -> not fixable by reserving
    return frozenset(reserve), frozenset(group_free)


def _solve_with_reserves(ctx: Context, baseline, time_limit: float,
                         extra_busy: frozenset = frozenset(),
                         overrides: dict | None = None,
                         initial_reserve: frozenset = frozenset(),
                         initial_group_free: frozenset = frozenset()):
    reserve = frozenset(initial_reserve)
    group_free = frozenset(initial_group_free)
    assign = fest = None
    for _round in range(3):
        assign, meta = solve_timetable(ctx, reserve, group_free, baseline=baseline,
                                       time_limit=time_limit)
        assign, _soft = polish_timetable(ctx, assign, time_limit=15.0)
        fest, bmeta = decide_bookings(ctx, assign, extra_busy=extra_busy,
                                      overrides=overrides)
        if bmeta["violations"]:
            raise RuntimeError(
                f"booking layer produced violations: {bmeta['violations'][:5]}")
        new_res, new_gf = _reservation_needs(ctx, assign, fest)
        if not (new_res - reserve) and not (new_gf - group_free):
            break
        reserve |= new_res
        group_free |= new_gf
    return assign, fest


def assemble_schedule(data: dict, team: str, assign: dict, fest: dict,
                      exams: list[dict]) -> dict:
    return {
        "team": team,
        "dataset_id": data.get("dataset_id"),
        "sessions": [
            {"session_id": sid, "day": d, "start_period": p, "room_id": r}
            for sid, (d, p, r) in sorted(assign.items())
        ],
        "fest_week": {
            "bookings": fest["bookings"],
            "session_overrides": fest["session_overrides"],
        },
        "exams": exams,
    }


def build_schedule(ctx: Context, team: str, time_limit: float = 120.0,
                   extra_busy: frozenset = frozenset(),
                   overrides: dict | None = None,
                   initial_reserve: frozenset = frozenset(),
                   initial_group_free: frozenset = frozenset()):
    """Fresh solve of the whole platform. Returns (schedule_dict, report, meta)."""
    assign, fest = _solve_with_reserves(
        ctx, None, time_limit, extra_busy=extra_busy, overrides=overrides,
        initial_reserve=initial_reserve, initial_group_free=initial_group_free)
    exams = solve_exams(ctx)
    exams, _exam_soft = polish_exams(ctx, exams, time_limit=10.0)
    sched = assemble_schedule(ctx.data, team, assign, fest, exams)
    report = checks.validate(ctx.data, sched)
    meta = {"assignments": len(assign)}
    return sched, report, meta


def _baseline_assign(schedule: dict) -> dict:
    return {e["session_id"]: (e["day"], e["start_period"], e["room_id"])
            for e in schedule.get("sessions", [])}


def explain_conflicts(ctx: Context, dis: dict, time_limit: float = 20.0) -> list[str]:
    """If the disrupted dataset has no feasible repair, find which individual
    change breaks feasibility (remove-one test) and say so plainly."""
    from ..dataset.models import apply_disruption, load_json  # noqa: F401
    import copy
    from ortools.sat.python import cp_model  # noqa: F401

    problems = []
    for ch in dis.get("changes", []):
        rest = {k: v for k, v in dis.items() if k != "changes"}
        rest["changes"] = [c for c in dis.get("changes", []) if c is not ch]
        try:
            sub = apply_disruption(ctx.data, rest)
            sub_ctx = Context.build(sub)
            solve_timetable(sub_ctx, time_limit=time_limit)
        except TimetableInfeasible:
            continue
        # removing this change makes it feasible -> this change is (a) culprit
        target = (ch.get("faculty_id") or ch.get("room_id") or ch.get("session_id")
                  or (ch.get("session") or {}).get("id")
                  or (ch.get("faculty") or {}).get("id"))
        problems.append(
            "change " + str(ch.get("type")) + " (" + str(target) + ") conflicts with "
            "hard constraints; removing it would restore feasibility")
    return problems


def build_schedule_after(ctx: Context, baseline_schedule: dict, team: str,
                         time_limit: float = 180.0,
                         extra_busy: frozenset = frozenset(),
                         overrides: dict | None = None,
                         initial_reserve: frozenset = frozenset(),
                         initial_group_free: frozenset = frozenset()):
    """Least-moves repair of the baseline under the (disrupted) dataset.
    Returns (schedule_dict, report, meta)."""
    baseline = _baseline_assign(baseline_schedule)
    try:
        assign, fest = _solve_with_reserves(
            ctx, baseline, time_limit, extra_busy=extra_busy,
            overrides=overrides, initial_reserve=initial_reserve,
            initial_group_free=initial_group_free)
    except TimetableInfeasible:
        raise
    exams = solve_exams(ctx)
    exams, _exam_soft = polish_exams(ctx, exams, time_limit=10.0)
    sched = assemble_schedule(ctx.data, team, assign, fest, exams)
    report = checks.validate(ctx.data, sched, baseline=baseline_schedule)
    meta = {"assignments": len(assign),
            "stability": report.get("stability", {})}
    return sched, report, meta
