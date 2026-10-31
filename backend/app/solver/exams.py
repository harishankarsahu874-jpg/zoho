"""Midsem exam scheduler (CP-SAT).

Exam week: calendar.exam_week days x sessions (AM/PM). A room seats half its
capacity during exams; one exam may use several rooms. Hard rules:
  * every exam scheduled exactly once,
  * rooms must allow "exam",
  * total half-capacity seats >= exam size,
  * a room hosts at most one exam per (day, session),
  * a group sits at most one exam per (day, session).
Soft: 5 per extra exam of the same group on the same day (validator semantics).
"""
from __future__ import annotations

import time as _time

from ortools.sat.python import cp_model

from ..dataset.models import Context


class ExamsInfeasible(RuntimeError):
    pass


def solve_exams(ctx: Context, time_limit: float = 120.0) -> list[dict]:
    cal = ctx.data["calendar"]["exam_week"]
    days = list(cal["days"])
    sess = [s["id"] for s in cal["sessions"]]
    exams = list(ctx.data.get("exams", []))
    if not exams:
        return []

    model = cp_model.CpModel()
    eids = [e["id"] for e in exams]
    day_var = {eid: {d: model.NewBoolVar(f"eday_{eid}_{d}") for d in days} for eid in eids}
    sess_var = {eid: {s: model.NewBoolVar(f"esess_{eid}_{s}") for s in sess} for eid in eids}
    for eid in eids:
        model.AddExactlyOne(day_var[eid].values())
        model.AddExactlyOne(sess_var[eid].values())

    exam_rooms = [rid for rid, r in ctx.rooms.items() if "exam" in r["allowed_uses"]]
    half = {rid: ctx.rooms[rid]["capacity"] // 2 for rid in exam_rooms}

    x = {eid: {rid: model.NewBoolVar(f"eroom_{eid}_{rid}") for rid in exam_rooms} for eid in eids}
    # (day, session) boolean per exam
    a = {}
    for eid in eids:
        for d in days:
            for s in sess:
                av = model.NewBoolVar(f"a_{eid}_{d}_{s}")
                model.Add(av <= day_var[eid][d])
                model.Add(av <= sess_var[eid][s])
                model.Add(av >= day_var[eid][d] + sess_var[eid][s] - 1)
                a[(eid, d, s)] = av

    obj = []
    for e in exams:
        eid = e["id"]
        # seats constraint (H5)
        model.Add(sum(half[rid] * x[eid][rid] for rid in exam_rooms) >= e["size"])
        # small cleanliness term: fewer rooms
        obj.append(sum(1 * x[eid][rid] for rid in exam_rooms))

    # room double-booking per (room, day, session) (H4)
    b = {}
    for eid in eids:
        for rid in exam_rooms:
            for d in days:
                for s in sess:
                # bv = x[eid][rid] AND a[eid][d][s]
                    bv = model.NewBoolVar(f"b_{eid}_{rid}_{d}_{s}")
                    model.Add(bv <= x[eid][rid])
                    model.Add(bv <= a[(eid, d, s)])
                    model.Add(bv >= x[eid][rid] + a[(eid, d, s)] - 1)
                    b[(eid, rid, d, s)] = bv
    for rid in exam_rooms:
        for d in days:
            for s in sess:
                terms = [b[(eid, rid, d, s)] for eid in eids]
                model.Add(sum(terms) <= 1)

    # group clash per (group, day, session) (H3)
    ex_by = {e["id"]: e for e in exams}
    for i in range(len(exams)):
        for j in range(i + 1, len(exams)):
            e1, e2 = ex_by[eids[i]], ex_by[eids[j]]
            if not set(e1["groups"]) & set(e2["groups"]):
                continue
            for d in days:
                for s in sess:
                    model.AddBoolOr([a[(eids[i], d, s)].Not(), a[(eids[j], d, s)].Not()])

    # soft: 5 per extra exam of a group on the same day
    g_exams: dict[str, list[str]] = {}
    for e in exams:
        for g in e["groups"]:
            g_exams.setdefault(g, []).append(e["id"])
    for g, eids_g in g_exams.items():
        for d in days:
            c = model.NewIntVar(0, len(eids_g), f"gc_{g}_{d}")
            model.Add(c == sum(day_var[eid][d] for eid in eids_g))
            e5 = model.NewIntVar(0, len(eids_g), f"ge_{g}_{d}")
            model.Add(e5 >= c - 1)
            obj.append(-5000 * e5)  # minimise (negative since we Maximise below)

    model.Maximize(-cp_model.LinearExpr.Sum(obj))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    t0 = _time.time()
    status = solver.Solve(model)
    elapsed = _time.time() - t0
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise ExamsInfeasible(f"status={solver.StatusName(status)} in {elapsed:.1f}s")

    out = []
    for e in exams:
        eid = e["id"]
        d = next(dd for dd in days if solver.Value(day_var[eid][dd]))
        s = next(ss for ss in sess if solver.Value(sess_var[eid][ss]))
        rooms = [rid for rid in exam_rooms if solver.Value(x[eid][rid])]
        out.append({"exam_id": eid, "day": d, "session": s, "rooms": rooms})
    return out
