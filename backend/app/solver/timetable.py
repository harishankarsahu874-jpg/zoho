"""Timetable solver.

Two-stage CP-SAT pipeline:
  Phase 1 - assign (day, start_period) to every session. All time-based hard
            constraints (faculty/group no-clash, daily caps, lunch, lab starts,
            fixed slots, unavailability, static room-supply caps) plus soft
            terms S1, S2, S3, S4, S6 with the exact validator weights.
  Phase 2 - assign a room to every session (times fixed). Room hard
            constraints (capacity, type, accessibility, unavailability,
            double-booking) plus soft S5 (underfilled rooms).

`reserve_cells` (room_id, day, period) mark cells the booking layer needs to
keep session-free (e.g. a confirmed institute event in the auditorium).
Sessions whose only compatible room is the reserved one are hard-forced away
from it; flexible sessions get a soft steer. `group_free` (group_id, day,
period) marks periods where a student group must have no class (mandatory-for-
group bookings).

`baseline` {sid: (day, start, room)} enables least-moves rescheduling: a
session that keeps its baseline time earns a large bonus, and if it keeps its
time, keeping its room earns one too. move_w >> any possible soft total, so
the solver first minimises moves, then the soft penalty.

Phase 1 also enforces *supply caps*: per (day, period), the number of sessions
that need a room of at least capacity X cannot exceed the number of such rooms
available that period (and, for labs, per lab type). These nested caps make
the room stage structurally feasible in practice and keep Phase 2 fast.
"""
from __future__ import annotations

import time as _time
from collections import defaultdict

from ortools.sat.python import cp_model

from ..dataset.models import Context

SOFT_W = {"S1": 2, "S2": 1, "S3": 3, "S4": 3, "S6": 1}  # exact validator weights
RESERVE_STEER = 10          # soft steer away from reserved cells (not in validator score)
DEFAULT_MOVE_W = 500        # >> any possible soft total -> moves are primary objective

LECTURE_TYPES = {"classroom", "lecture_hall", "auditorium"}


class TimetableInfeasible(RuntimeError):
    def __init__(self, detail: str = ""):
        super().__init__(detail or "timetable model infeasible")
        self.detail = detail


def _starts_for(session: dict, ctx: Context) -> list[int]:
    dur = session["duration"]
    starts = list(range(1, ctx.last_teaching - dur + 2))  # 1 .. 10-dur
    if session["kind"] == "lab":
        starts = [p for p in starts if p in ctx.lab_starts]
    fx = session.get("fixed_slot")
    if fx:
        starts = [fx["start_period"]]
    return [p for p in starts if 1 <= p <= ctx.last_teaching - dur + 1]


def _covers(doms: list[int], dur: int, p: int) -> list[int]:
    """Start periods (within doms) whose block [s, s+dur) covers period p."""
    return [q for q in doms if q <= p <= q + dur - 1]


def _and_pair(model: cp_model.CpModel, a, b, name: str):
    """Boolean variable that is exactly a AND b (both 0/1 bool vars)."""
    c = model.NewBoolVar(name)
    model.Add(c <= a)
    model.Add(c <= b)
    model.Add(c >= a + b - 1)
    return c


# --------------------------------------------------------------------------
# fast greedy seed (used only for solution hints; the solver keeps full control)
def greedy_seed_times(ctx: Context,
                      reserve_cells: frozenset[tuple[str, str, int]],
                      group_free: frozenset[tuple[str, str, int]]
                      ) -> dict[str, tuple[str, int]] | None:
    """Quickly find a hard-feasible (day, start) for every session.
    Returns None if it gets stuck (the CP-SAT solve still runs)."""
    gf = defaultdict(list)
    for (g, d, p) in group_free:
        gf[g].append((d, p))
    only_room_cache = {
        sid: {rid for rid, r in ctx.rooms.items() if ctx.allowed_room(ctx.sessions[sid], r)}
        for sid in ctx.sessions
    }
    placed: dict[str, tuple[str, int]] = {}
    fac_blocks: dict[str, list[tuple[str, int, int]]] = defaultdict(list)  # (day, start, dur)
    fac_hours: dict[tuple[str, str], int] = defaultdict(int)
    grp_blocks: dict[str, list[tuple[str, str | None, int, int]]] = defaultdict(list)

    def overlap(d1: str, s1: int, dur1: int, d2: str, s2: int, dur2: int) -> bool:
        return d1 == d2 and s1 <= s2 + dur2 - 1 and s2 <= s1 + dur1 - 1

    def feasible(sid: str, d: str, p: int) -> bool:
        s = ctx.sessions[sid]
        dur = s["duration"]
        if p <= ctx.lunch < p + dur:
            return False
        if any(ctx.fac_unfree(s["faculty_id"], d, pp) for pp in range(p, p + dur)):
            return False
        if fac_hours[(s["faculty_id"], d)] + dur > ctx.max_hours_per_day(s["faculty_id"]):
            return False
        for (bd, bp, bdur) in fac_blocks[s["faculty_id"]]:
            if overlap(d, p, dur, bd, bp, bdur):
                return False
        for g in s["groups"]:
            for (gd, key, gp, gdur) in grp_blocks[g]:
                if key == s.get("basket_slot") and key is not None:
                    continue  # same basket: aligned, not a clash
                if overlap(d, p, dur, gd, gp, gdur):
                    return False
            for (gd, gp) in gf.get(g, ()):
                if gd == d and p <= gp <= p + dur - 1:
                    return False
        for (r_id, r_d, r_p) in reserve_cells:
            if only_room_cache[sid] == {r_id} and r_d == d and p <= r_p <= p + dur - 1:
                return False
        return True

    order = sorted(ctx.sessions,
                   key=lambda sid: (0 if ctx.sessions[sid].get("fixed_slot") else
                                    1 if ctx.sessions[sid]["kind"] == "lab" else 2,
                                    -ctx.sessions[sid]["size"]))
    day_order = ctx.days
    for sid in order:
        s = ctx.sessions[sid]
        found = None
        for d in day_order:
            for p in _starts_for(s, ctx):
                if feasible(sid, d, p):
                    found = (d, p)
                    break
            if found:
                break
        if found is None:
            return None
        placed[sid] = found
        d, p = found
        fac_blocks[s["faculty_id"]].append((d, p, s["duration"]))
        fac_hours[(s["faculty_id"], d)] += s["duration"]
        for g in s["groups"]:
            grp_blocks[g].append((d, s.get("basket_slot"), p, s["duration"]))
    return placed


def _solve_times(ctx: Context,
                 reserve_cells: frozenset[tuple[str, str, int]],
                 group_free: frozenset[tuple[str, str, int]],
                 baseline: dict | None,
                 time_limit: float,
                 move_w: int,
                 seed: dict[str, tuple[str, int]] | None = None) -> dict[str, tuple[str, int]]:
    model = cp_model.CpModel()
    sids = list(ctx.sessions)
    day_var: dict[str, dict[str, any]] = {}
    start_var: dict[str, dict[int, any]] = {}
    doms: dict[str, list[int]] = {}
    obj_terms = []

    # ---------------- variables
    for sid in sids:
        s = ctx.sessions[sid]
        day_var[sid] = {d: model.NewBoolVar(f"day_{sid}_{d}") for d in ctx.days}
        doms[sid] = _starts_for(s, ctx)
        start_var[sid] = {p: model.NewBoolVar(f"st_{sid}_{p}") for p in doms[sid]}
        model.AddExactlyOne(day_var[sid].values())
        model.AddExactlyOne(start_var[sid].values())
        fx = s.get("fixed_slot")
        if fx:
            model.Add(day_var[sid][fx["day"]] == 1)
            model.Add(start_var[sid][fx["start_period"]] == 1)

    # ---------------- hard: lunch crossing
    for sid in sids:
        s = ctx.sessions[sid]
        dur = s["duration"]
        for d in ctx.days:
            for p in doms[sid]:
                if p <= ctx.lunch < p + dur:
                    model.AddBoolOr([day_var[sid][d].Not(), start_var[sid][p].Not()])

    # ---------------- hard: faculty unavailability (H7)
    for sid in sids:
        s = ctx.sessions[sid]
        dur = s["duration"]
        for u in ctx.fac[s["faculty_id"]].get("unavailable", []):
            for p in u["periods"]:
                for q in _covers(doms[sid], dur, p):
                    model.AddBoolOr([day_var[sid][u["day"]].Not(), start_var[sid][q].Not()])

    # ---------------- hard: group must be free (booking coordination)
    gf_by_group: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for (g, d, p) in group_free:
        gf_by_group[g].append((d, p))
    for sid in sids:
        s = ctx.sessions[sid]
        dur = s["duration"]
        for g in s["groups"]:
            for (d, p) in gf_by_group.get(g, ()):
                for q in _covers(doms[sid], dur, p):
                    model.AddBoolOr([day_var[sid][d].Not(), start_var[sid][q].Not()])

    # ---------------- hard: reserved cells of a room that is the only option
    only_room_cache: dict[str, set[str]] = {}
    for sid in sids:
        s = ctx.sessions[sid]
        only_room_cache[sid] = {rid for rid, r in ctx.rooms.items()
                                if ctx.allowed_room(s, r)}
    for sid in sids:
        dur = ctx.sessions[sid]["duration"]
        only = only_room_cache[sid]
        for (r_id, r_d, r_p) in reserve_cells:
            if only == {r_id}:
                for q in _covers(doms[sid], dur, r_p):
                    model.AddBoolOr([day_var[sid][r_d].Not(), start_var[sid][q].Not()])

    # ---------------- shared cover cache: cover[(sid,d,p)] = session covers (d,p)
    cover: dict[tuple[str, str, int], any] = {}
    for sid in sids:
        dur = ctx.sessions[sid]["duration"]
        for d in ctx.days:
            for p in range(1, 10):
                qs = _covers(doms[sid], dur, p)
                if not qs:
                    continue
                t = model.NewBoolVar(f"cvt_{sid}_{d}_{p}")
                model.AddMaxEquality(t, [start_var[sid][q] for q in qs] + [0])
                cover[(sid, d, p)] = _and_pair(model, day_var[sid][d], t, f"cv_{sid}_{d}_{p}")

    # ---------------- intervals for no-clash constraints
    intervals = {}
    for sid in sids:
        dur = ctx.sessions[sid]["duration"]
        pe = (sum(9 * i * day_var[sid][ctx.days[i]] for i in range(len(ctx.days)))
              + sum((p - 1) * start_var[sid][p] for p in doms[sid]))
        pos = model.NewIntVar(0, 44, f"pos_{sid}")
        model.Add(pos == pe)
        intervals[sid] = model.NewIntervalVar(pos, dur, pos + dur, f"iv_{sid}")

    # H2: faculty no double-booking + H12: daily cap
    by_fac: dict[str, list[str]] = defaultdict(list)
    for sid in sids:
        by_fac[ctx.sessions[sid]["faculty_id"]].append(sid)
    for f, slist in by_fac.items():
        if len(slist) > 1:
            model.AddNoOverlap([intervals[x] for x in slist])
        cap = ctx.max_hours_per_day(f)
        for d in ctx.days:
            model.Add(sum(ctx.sessions[x]["duration"] * day_var[x][d] for x in slist) <= cap)

    # H11: sessions of the same elective basket slot share day and start
    by_basket: dict[str, list[str]] = defaultdict(list)
    for sid in sids:
        b = ctx.sessions[sid].get("basket_slot")
        if b:
            by_basket[b].append(sid)
    for b, slist in by_basket.items():
        for i in range(len(slist)):
            for j in range(i + 1, len(slist)):
                a, bb = slist[i], slist[j]
                for d in ctx.days:
                    model.Add(day_var[a][d] == day_var[bb][d])
                for p in set(doms[a]) & set(doms[bb]):
                    model.Add(start_var[a][p] == start_var[bb][p])

    # H3: student groups - different basket keys must not overlap
    by_group: dict[str, list[str]] = defaultdict(list)
    for sid in sids:
        for g in ctx.sessions[sid]["groups"]:
            by_group[g].append(sid)
    for g, slist in by_group.items():
        uniq = list(dict.fromkeys(slist))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = uniq[i], uniq[j]
                ka = ctx.sessions[a].get("basket_slot") or a
                kb = ctx.sessions[b].get("basket_slot") or b
                if ka == kb:
                    continue  # same elective basket: students attend only one
                model.AddNoOverlap([intervals[a], intervals[b]])

    # ---------------- hard: static room-supply caps (keep phase 2 feasible)
    cells_cover: dict[tuple[str, int], list[str]] = defaultdict(list)
    for sid in sids:
        dur = ctx.sessions[sid]["duration"]
        for d in ctx.days:
            for p in range(1, 10):
                if (sid, d, p) in cover:
                    cells_cover[(d, p)].append(sid)

    def _supply(need_types: set[str], min_cap: int, d: str, p: int) -> int:
        return sum(1 for rid, r in ctx.rooms.items()
                   if r["type"] in need_types and r["capacity"] >= min_cap
                   and not ctx.room_unfree(rid, d, p))

    # lab caps per lab type
    lab_by_type: dict[str, list[str]] = defaultdict(list)
    for sid in sids:
        if ctx.sessions[sid]["kind"] == "lab":
            lab_by_type[ctx.sessions[sid]["room_types"][0]].append(sid)
    for t, slist in lab_by_type.items():
        for d in ctx.days:
            for p in range(1, 10):
                terms = [cover[(x, d, p)] for x in slist if (x, d, p) in cover]
                if not terms:
                    continue
                supply = _supply({t}, 0, d, p)
                if supply >= len(terms):
                    continue
                model.Add(sum(terms) <= supply)

    # nested capacity caps for lectures/tutorials (one room-type family here)
    lect_sids = [sid for sid in sids if ctx.sessions[sid]["kind"] != "lab"]
    sizes = sorted({ctx.sessions[sid]["size"] for sid in lect_sids})
    for d in ctx.days:
        for p in range(1, 10):
            here = cells_cover.get((d, p), [])
            if not here:
                continue
            for sigma in sizes:
                terms = [cover[(x, d, p)] for x in here
                         if ctx.sessions[x]["size"] >= sigma]
                if not terms:
                    continue
                supply = _supply(LECTURE_TYPES, sigma, d, p)
                if supply >= len(terms):
                    continue
                model.Add(sum(terms) <= supply)

    # ---------------- soft S1: faculty avoid-lists (2 per covered period)
    for sid in sids:
        s = ctx.sessions[sid]
        for pref in ctx.fac[s["faculty_id"]].get("preferences", []):
            if pref.get("type") != "avoid":
                continue
            for d in pref.get("days", ctx.days):
                if d not in ctx.days:
                    continue
                for p in pref.get("periods", []):
                    if (sid, d, p) in cover:
                        obj_terms.append(SOFT_W["S1"] * cover[(sid, d, p)])

    # ---------------- soft S6: session ending at P9 (1 each)
    for sid in sids:
        for d in ctx.days:
            if (sid, d, 9) in cover:
                obj_terms.append(SOFT_W["S6"] * cover[(sid, d, 9)])

    # ---------------- soft S3: group-day hours beyond 6 (3 per hour)
    for g, slist in by_group.items():
        for d in ctx.days:
            h = model.NewIntVar(0, 45, f"h_{g}_{d}")
            model.Add(h == sum(ctx.sessions[x]["duration"] * day_var[x][d] for x in slist))
            e3 = model.NewIntVar(0, 15, f"e3_{g}_{d}")
            model.Add(e3 >= h - 6)
            obj_terms.append(SOFT_W["S3"] * e3)

    # ---------------- soft S4: repeat lectures of one course in a group-day
    course_gd: dict[tuple[str, str], list[str]] = defaultdict(list)
    for sid in sids:
        s = ctx.sessions[sid]
        if s["kind"] == "lecture" and not s.get("basket_slot"):
            for g in s["groups"]:
                course_gd[(g, s["course_id"])].append(sid)
    for (g, c), slist in course_gd.items():
        for d in ctx.days:
            n = model.NewIntVar(0, len(slist), f"n_{g}_{c}_{d}")
            model.Add(n == sum(day_var[x][d] for x in slist))
            e4 = model.NewIntVar(0, len(slist), f"e4_{g}_{c}_{d}")
            model.Add(e4 >= n - 1)
            obj_terms.append(SOFT_W["S4"] * e4)

    basket_course: dict[str, list[str]] = defaultdict(list)
    for sid in sids:
        if ctx.sessions[sid].get("basket_slot"):
            basket_course[ctx.sessions[sid]["course_id"]].append(sid)
    for c, slist in basket_course.items():
        rep = list(dict.fromkeys(slist))
        for d in ctx.days:
            n = model.NewIntVar(0, len(rep), f"nb_{c}_{d}")
            model.Add(n == sum(day_var[x][d] for x in rep))
            e4b = model.NewIntVar(0, len(rep), f"e4b_{c}_{d}")
            model.Add(e4b >= n - 1)
            obj_terms.append(SOFT_W["S4"] * e4b)

    # ---------------- soft S2: free periods between a group's classes (1 each)
    for g, slist in by_group.items():
        uniq = list(dict.fromkeys(slist))
        for d in ctx.days:
            m_st = model.NewIntVar(1, 9, f"mst_{g}_{d}")
            m_e = model.NewIntVar(0, 9, f"me_{g}_{d}")
            occ_sum_terms = []
            for p in range(1, 10):
                cs = [cover[(x, d, p)] for x in uniq if (x, d, p) in cover]
                if cs:
                    occ = model.NewBoolVar(f"occm_{g}_{d}_{p}")
                    model.AddMaxEquality(occ, cs + [0])
                    occ_sum_terms.append(occ)
            gap = model.NewIntVar(0, 9, f"gap_{g}_{d}")
            model.Add(gap >= m_e - m_st + 1 - cp_model.LinearExpr.Sum(occ_sum_terms))
            obj_terms.append(SOFT_W["S2"] * gap)
            for x in uniq:
                st_p = sum(pp * start_var[x][pp] for pp in doms[x])
                end_p = st_p + ctx.sessions[x]["duration"] - 1
                model.Add(m_e >= end_p - 8 * (1 - day_var[x][d]))
                model.Add(m_st <= st_p + 8 * (1 - day_var[x][d]))

    # ---------------- soft: steer flexible sessions away from reserved cells
    if reserve_cells:
        for sid in sids:
            only = only_room_cache[sid]
            for (r_id, r_d, r_p) in reserve_cells:
                if r_id not in only or only == {r_id}:
                    continue
                if (sid, r_d, r_p) in cover:
                    obj_terms.append(RESERVE_STEER * cover[(sid, r_d, r_p)])

    # ---------------- keep-bonus (least-moves rescheduling)
    if baseline:
        for sid in sids:
            base = baseline.get(sid)
            s = ctx.sessions[sid]
            if not base:
                continue
            b_day, b_start, _b_room = base
            if b_day not in ctx.days or b_start not in doms[sid]:
                continue
            legal = True
            for p in range(b_start, b_start + s["duration"]):
                if ctx.fac_unfree(s["faculty_id"], b_day, p):
                    legal = False
                    break
            if legal and s.get("fixed_slot"):
                legal = (s["fixed_slot"]["day"] == b_day
                         and s["fixed_slot"]["start_period"] == b_start)
            if not legal:
                continue
            keep = _and_pair(model, day_var[sid][b_day], start_var[sid][b_start],
                             f"keep_{sid}")
            obj_terms.append(move_w * (1 - keep))

    # ---------------- hints
    if seed:
        for sid, (d, p) in seed.items():
            if sid in day_var and d in day_var[sid] and p in start_var[sid]:
                model.AddHint(day_var[sid][d], 1)
                model.AddHint(start_var[sid][p], 1)
    elif baseline:
        for sid in sids:
            base = baseline.get(sid)
            if base and base[0] in day_var[sid] and base[1] in start_var[sid]:
                model.AddHint(day_var[sid][base[0]], 1)
                model.AddHint(start_var[sid][base[1]], 1)

    model.Minimize(cp_model.LinearExpr.Sum(obj_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    t0 = _time.time()
    status = solver.Solve(model)
    elapsed = _time.time() - t0
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise TimetableInfeasible(f"phase1 status={solver.StatusName(status)} in {elapsed:.1f}s")

    out: dict[str, tuple[str, int]] = {}
    for sid in sids:
        d = next(ctx.days[i] for i in range(len(ctx.days))
                 if solver.Value(day_var[sid][ctx.days[i]]))
        p = next(pp for pp in doms[sid] if solver.Value(start_var[sid][pp]))
        out[sid] = (d, p)
    return out


def _solve_rooms(ctx: Context,
                 times: dict[str, tuple[str, int]],
                 baseline: dict | None,
                 time_limit: float,
                 move_w: int) -> dict[str, str]:
    model = cp_model.CpModel()
    sids = list(times)
    x: dict[str, dict[str, any]] = {}
    obj = []
    for sid in sids:
        s = ctx.sessions[sid]
        day, start = times[sid]
        dur = s["duration"]
        compat = [rid for rid, r in ctx.rooms.items()
                  if ctx.allowed_room(s, r)
                  and all(not ctx.room_unfree(rid, day, p) for p in range(start, start + dur))]
        if not compat:
            raise TimetableInfeasible(f"no compatible room for {sid} at {day} P{start}")
        x[sid] = {rid: model.NewBoolVar(f"room_{sid}_{rid}") for rid in compat}
        model.AddExactlyOne(x[sid].values())
        for rid in compat:
            r = ctx.rooms[rid]
            if r["capacity"] and s["size"] / r["capacity"] < 0.4:
                obj.append(1 * x[sid][rid])  # S5
        if baseline and sid in baseline:
            b_day, b_start, b_room = baseline[sid]
            if (b_day, b_start) == (day, start) and b_room in x[sid]:
                obj.append(-move_w * x[sid][b_room])
                model.AddHint(x[sid][b_room], 1)

    # H4: a room holds at most one session per (day, period)
    cells: dict[tuple[str, str, int], list[str]] = defaultdict(list)
    for sid in sids:
        s = ctx.sessions[sid]
        day, start = times[sid]
        for p in range(start, start + s["duration"]):
            for rid in x[sid]:
                cells[(rid, day, p)].append(sid)
    for (rid, day, p), slist in cells.items():
        if len(slist) > 1:
            model.Add(sum(x[s][rid] for s in slist) <= 1)

    model.Minimize(cp_model.LinearExpr.Sum(obj))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    t0 = _time.time()
    status = solver.Solve(model)
    elapsed = _time.time() - t0
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise TimetableInfeasible(f"phase2 status={solver.StatusName(status)} in {elapsed:.1f}s")

    out: dict[str, str] = {}
    for sid in sids:
        out[sid] = next(rid for rid in x[sid] if solver.Value(x[sid][rid]))
    return out


def solve_timetable(ctx: Context,
                    reserve_cells: frozenset[tuple[str, str, int]] = frozenset(),
                    group_free: frozenset[tuple[str, str, int]] = frozenset(),
                    baseline: dict | None = None,
                    time_limit: float = 120.0,
                    move_w: int = DEFAULT_MOVE_W,
                    seed: dict | None = None):
    """Solve the full timetable. Returns (assign, meta);
    assign = {sid: (day, start, room)}."""
    t1 = _time.time()
    if seed is None:
        seed = greedy_seed_times(ctx, frozenset(reserve_cells), frozenset(group_free))
    times = _solve_times(ctx, frozenset(reserve_cells), frozenset(group_free),
                         baseline, time_limit, move_w, seed=seed)
    t2 = _time.time()
    rooms = _solve_rooms(ctx, times, baseline, max(5.0, time_limit / 4), move_w)
    assign = {sid: (times[sid][0], times[sid][1], rooms[sid]) for sid in times}
    meta = {"phase1_s": round(t2 - t1, 1), "phase2_s": round(_time.time() - t2, 1)}
    return assign, meta
