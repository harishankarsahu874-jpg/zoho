"""Spectra week (Week 7) booking decisions.

Deterministic policy (no LLM involved):
  1. Institute events (effective category) are handled first, in priority
     order. They may displace regular sessions (session_overrides) when their
     window is otherwise blocked - the displaced session must be moved to a
     fully valid new slot, verified by the official checker.
  2. All other requests get candidate placements inside their windows that are
     free of sessions, room unavailability and mandatory-group classes. A
     CP-SAT allocation then chooses placements maximising total category
     weight (with a small priority-order tiebreak) subject to no two bookings
     sharing a room-period. This keeps the booking set inversion-free: a
     higher-priority request can never lose a slot to a lower one, because
     swapping would raise the objective.
  3. Leftover requests are offered the best free alternative (any day/period,
     any compliant room) or rejected with a specific, human-readable reason.

Every decision carries a reason. Cancelled requests are always rejected.
"""
from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from ..dataset.models import Context
from ..validation import checks

CAT_WEIGHT = {"institute_event": 5, "guest_lecture": 4, "department_event": 3, "club_event": 2}
MAX_PERIOD = 13


def _window_starts(w: dict, dur: int) -> range:
    """Valid start periods for a booking of `dur` inside window w
    (end period must stay <= MAX_PERIOD)."""
    return range(w["from_period"], min(w["to_period"], MAX_PERIOD) - dur + 2)


def _candidate_rooms(ctx: Context, req: dict) -> list[str]:
    """Rooms that statically satisfy the request (type, capacity, features,
    event use). Ordered: requested room first, then ascending capacity
    (keep big rooms free for larger requests)."""
    out = []
    for rid, r in ctx.rooms.items():
        if "event" not in r["allowed_uses"]:
            continue
        if r["type"] not in req["room_types"]:
            continue
        if r["capacity"] < req["attendance"]:
            continue
        if set(req.get("needs", [])) - ctx.room_features(r):
            continue
        out.append(rid)
    out.sort(key=lambda rid: (rid != req.get("requested_room"), ctx.rooms[rid]["capacity"]))
    return out


def _cell_free(ctx: Context, room_busy: dict, week_grp: dict, room: str, day: str,
               periods, req: dict) -> tuple[bool, str]:
    """Check one concrete placement against the current week view."""
    for p in periods:
        if ctx.room_unfree(room, day, p):
            return False, f"{room} unavailable {day} P{p}"
        busy = room_busy.get((room, day, p), [])
        if busy:
            return False, f"{room} {day} P{p} already used by {', '.join(busy)}"
        for g in req.get("mandatory_for_groups", []):
            if week_grp.get((g, day, p)):
                return False, f"mandatory for {g}, who have class {day} P{p}"
    return True, ""


def _find_new_slot(ctx: Context, sess: dict, week: dict) -> tuple | None:
    """Greedy re-slot for a displaced session against the current week view.

    Prefers the smallest adequate room, the session's current room first.
    Returns (day, start, room) or None.
    """
    dur = sess["duration"]
    comp = [rid for rid, r in ctx.rooms.items() if ctx.allowed_room(sess, r)]
    cur = week.get(sess["id"], (None, None, None))[2]
    comp.sort(key=lambda rid: (rid != cur, ctx.rooms[rid]["capacity"]))
    fac_hours: dict[tuple[str, str], int] = defaultdict(int)
    for sid, (d, st, rid) in week.items():
        s = ctx.sessions[sid]
        fac_hours[(s["faculty_id"], d)] += s["duration"]
    for d in ctx.days:
        for p in range(1, ctx.last_teaching - dur + 2):
            if sess["kind"] == "lab" and p not in ctx.lab_starts:
                continue
            if p <= ctx.lunch < p + dur:
                continue
            per = range(p, p + dur)
            f = sess["faculty_id"]
            if any(ctx.fac_unfree(f, d, pp) for pp in per):
                continue
            if fac_hours[(f, d)] + dur > ctx.max_hours_per_day(f):
                continue
            grp_ok = True
            for g in sess["groups"]:
                for pp in per:
                    if week_grp_of(ctx, week, g, d, pp):
                        grp_ok = False
                        break
                if not grp_ok:
                    break
            if not grp_ok:
                continue
            for rid in comp:
                if any(ctx.room_unfree(rid, d, pp) for pp in per):
                    continue
                clash = False
                for pp in per:
                    for sid2 in room_busy_of(ctx, week).get((rid, d, pp), []):
                        if sid2 != sess["id"]:
                            clash = True
                            break
                    if clash:
                        break
                if not clash:
                    return (d, p, rid)
    return None


def week_grp_of(ctx: Context, week: dict, g: str, d: str, p: int) -> bool:
    occ = checks.grp_occ_of(ctx, week)
    return bool(occ.get((g, d, p)))


def room_busy_of(ctx: Context, week: dict) -> dict:
    out: dict[tuple, list] = defaultdict(list)
    for sid, (d, st, rid) in week.items():
        s = ctx.sessions.get(sid)
        if not s:
            continue
        for p in range(st, st + s["duration"]):
            out[(rid, d, p)].append(sid)
    return out


def _first_alt(ctx: Context, req: dict, room_busy: dict, week_grp: dict,
               rooms: list[str]) -> tuple | None:
    """Best free alternative: prefer event periods (P10+), then earliest,
    in candidate-room order (requested room first)."""
    dur = req["duration_periods"]
    order = sorted(range(1, MAX_PERIOD - dur + 2), key=lambda a: (a < 10, a))
    for rid in rooms:
        for d in ctx.days:
            for a in order:
                ok, _ = _cell_free(ctx, room_busy, week_grp, rid, d,
                                   range(a, a + dur), req)
                if ok:
                    return (rid, d, a)
    return None


def _reject_reasons(ctx: Context, req: dict, room_busy: dict, week_grp: dict,
                    rooms: list[str]) -> list[str]:
    if not rooms:
        best = None
        for rid, r in ctx.rooms.items():
            if r["type"] in req["room_types"] and "event" in r["allowed_uses"]:
                if best is None or r["capacity"] > best[1]:
                    best = (rid, r["capacity"])
        if best:
            return [f"no room of the requested types seats {req['attendance']} "
                    f"(largest available: {best[0]} with {best[1]} seats)"]
        return ["no room matches the requested type/feature/capacity requirements"]
    blocked_sessions, blocked_groups, blocked_unavail = set(), set(), set()
    for rid in rooms:
        for w in req["windows"]:
            for a in _window_starts(w, req["duration_periods"]):
                for p in range(a, a + req["duration_periods"]):
                    if ctx.room_unfree(rid, w["day"], p):
                        blocked_unavail.add(f"{rid} {w['day']} P{p}")
                    for s in room_busy.get((rid, w["day"], p), []):
                        if s in ctx.sessions:
                            blocked_sessions.add(f"{rid} {w['day']} P{p} ({s})")
                    for g in req.get("mandatory_for_groups", []):
                        if week_grp.get((g, w["day"], p)):
                            blocked_groups.add(f"{g} has a class {w['day']} P{p}")
    out = []
    if blocked_groups and not blocked_sessions:
        out.append(f"mandatory group(s) are not free: {', '.join(sorted(blocked_groups)[:3])}")
    if blocked_sessions:
        out.append(f"every requested slot is occupied, e.g. {', '.join(sorted(blocked_sessions)[:3])}")
    if blocked_unavail:
        out.append(f"room unavailable: {', '.join(sorted(blocked_unavail)[:3])}")
    if not out:
        out.append("no compliant free slot exists in the requested windows")
    return out


def decide_bookings(ctx: Context, week_assign: dict,
                    time_limit: float = 30.0,
                    extra_busy: frozenset = frozenset(),
                    overrides: dict | None = None) -> tuple[dict, dict]:
    """Return (fest_week_dict, meta) for the given week-7 timetable view.

    extra_busy: (room, day, period) cells already taken by app-level manual
    bookings - dataset bookings must not overlap them.
    overrides: {request_id: decision} manual decisions made in the app; they
    are applied first (in priority order) and the engine never re-decides them.
    """
    data = ctx.data
    reqs = list(ctx.req.items())
    room_busy = room_busy_of(ctx, week_assign)
    for cell in extra_busy:
        room_busy.setdefault(cell, []).append("MANUAL-RESERVED")
    week_grp = checks.grp_occ_of(ctx, week_assign)

    decisions: dict[str, dict] = {}
    overrides_out: list[dict] = []
    bookings_busy: dict[tuple, list] = {}  # booking-id occupancy (survives rebuilds)

    def place(req: dict, status: str, reason: str, room=None, day=None, a=None, b=None):
        nonlocal room_busy
        d = {"request_id": req["id"], "status": status, "reason": reason}
        if room is not None:
            d.update({"day": day, "start_period": a, "end_period": b, "room_id": room})
        decisions[req["id"]] = d
        if status in ("approved", "alternative_offered") and room is not None:
            for p in range(a, b + 1):
                room_busy.setdefault((room, day, p), []).append(req["id"])
                bookings_busy.setdefault((room, day, p), []).append(req["id"])

    def rebuild_room_busy(week: dict):
        nonlocal room_busy
        room_busy = room_busy_of(ctx, week)
        for cell, ids in bookings_busy.items():
            room_busy.setdefault(cell, []).extend(ids)

    # ---- manual app decisions first (they outrank the engine's opinion) ----
    if overrides:
        manual_ranked = sorted(
            ((rid, ctx.req[rid]) for rid in overrides if rid in ctx.req),
            key=lambda kv: ctx.booking_rank(kv[1]))
        for rid, req in manual_ranked:
            ov = overrides[rid]
            st = ov.get("status", "rejected")
            if st in ("approved", "alternative_offered") and ov.get("room_id"):
                day, a, b = ov["day"], ov["start_period"], ov["end_period"]
                ok, _blk = _cell_free(ctx, room_busy, week_grp, ov["room_id"],
                                      day, range(a, b + 1), req)
                if ok:
                    place(req, st, ov.get("reason") or "manual decision",
                          ov["room_id"], day, a, b)
                    continue
            place(req, "rejected",
                  ov.get("reason") or "manual decision (placement not keepable)")
            reqs = [(r, q) for r, q in reqs if r != rid]

    ordered = sorted(reqs, key=lambda kv: ctx.booking_rank(kv[1]))
    institute = [(rid, req) for rid, req in ordered
                 if ctx.effective_category(data, req) == "institute_event"
                 and rid not in ctx.cancelled]
    others = [(rid, req) for rid, req in ordered if (rid, req) not in institute]

    # ---------- 1. institute events first (may displace sessions) ----------
    for req_id, req in institute:
        dur = req["duration_periods"]
        rooms = _candidate_rooms(ctx, req)
        placed = False
        for rid in rooms:
            for w in req["windows"]:
                for a in _window_starts(w, dur):
                    per = range(a, a + dur)
                    ok, _ = _cell_free(ctx, room_busy, week_grp, rid, w["day"], per, req)
                    if ok:
                        place(req, "approved",
                              f"Institute event; {rid} free {w['day']} P{a}-P{a + dur - 1}.",
                              rid, w["day"], a, a + dur - 1)
                        placed = True
                        break
                if placed:
                    break
            if placed:
                break
        if placed:
            continue

        # blocked only by sessions -> try to displace them (valid overrides)
        displaced_any = False
        for rid in rooms:
            for w in req["windows"]:
                for a in _window_starts(w, dur):
                    per = list(range(a, a + dur))
                    blockers, hard_block = [], False
                    for p in per:
                        if ctx.room_unfree(rid, w["day"], p):
                            hard_block = True
                            break
                        for s in room_busy.get((rid, w["day"], p), []):
                            if s in ctx.sessions and s not in blockers:
                                blockers.append(s)
                        for g in req.get("mandatory_for_groups", []):
                            if week_grp.get((g, w["day"], p)):
                                hard_block = True
                    if hard_block or not blockers:
                        continue
                    moved_week = dict(week_assign)
                    new_slots: dict[str, tuple] = {}
                    failed = False
                    for b_sid in blockers:
                        slot = _find_new_slot(ctx, ctx.sessions[b_sid], moved_week)
                        if slot is None:
                            failed = True
                            break
                        new_slots[b_sid] = slot
                        moved_week[b_sid] = slot
                    if failed:
                        continue
                    # displaced sessions must not land back in the event's own cell
                    ev_cell = (rid, w["day"], a, a + dur - 1)
                    if any(nr == ev_cell[0] and nd == ev_cell[1]
                           and not (np + ctx.sessions[b_sid]["duration"] - 1 < ev_cell[2]
                                    or np > ev_cell[3])
                           for b_sid, (nd, np, nr) in new_slots.items()):
                        continue
                    viols = checks.check_assignment(ctx, moved_week)
                    if viols:
                        continue
                    # commit: rebuild session occupancy, keep booking occupancy
                    rebuild_room_busy(moved_week)
                    for b_sid, (nd, np, nr) in new_slots.items():
                        overrides_out.append({"session_id": b_sid, "day": nd,
                                              "start_period": np, "room_id": nr,
                                              "displaced_by": req_id})
                    place(req, "approved",
                          f"Institute event; displaced {len(new_slots)} session(s) to free "
                          f"{rid} {w['day']} P{a}-P{a + dur - 1}.",
                          rid, w["day"], a, a + dur - 1)
                    placed = displaced_any = True
                    break
                if placed:
                    break
            if placed:
                break
        if placed:
            continue

        # fallback: alternative without displacement
        alt = _first_alt(ctx, req, room_busy, week_grp, rooms)
        if alt:
            ar, ad, aa = alt
            place(req, "alternative_offered",
                  "Institute event; requested window not fully free; offered in "
                  f"{ar} {ad} P{aa}-P{aa + dur - 1} instead.",
                  ar, ad, aa, aa + dur - 1)
        else:
            place(req, "rejected",
                  "Institute event; " + "; ".join(
                      _reject_reasons(ctx, req, room_busy, week_grp, rooms)))

    # ---------- 2. everyone else: CP-SAT window allocation ----------
    cands: dict[str, list[tuple[str, str, int]]] = {}
    for req_id, req in others:
        if req_id in ctx.cancelled:
            continue
        dur = req["duration_periods"]
        rooms = _candidate_rooms(ctx, req)
        lst = []
        for rid in rooms:
            for w in req["windows"]:
                for a in _window_starts(w, dur):
                    ok, _ = _cell_free(ctx, room_busy, week_grp, rid, w["day"],
                                       range(a, a + dur), req)
                    if ok:
                        lst.append((rid, w["day"], a))
        cands[req_id] = lst

    sel_vars: dict[str, list] = {}
    model = cp_model.CpModel()
    has_vars = False
    for req_id, req in others:
        if req_id in ctx.cancelled or not cands.get(req_id):
            continue
        sel_vars[req_id] = [model.NewBoolVar(f"sel_{req_id}_{i}")
                            for i in range(len(cands[req_id]))]
        model.AddAtMostOne(sel_vars[req_id])
        has_vars = True

    cell_cands: dict[tuple, list[tuple[str, int]]] = defaultdict(list)
    for req_id, lst in cands.items():
        if req_id in ctx.cancelled or req_id not in sel_vars:
            continue
        for i, (rid, day, a) in enumerate(lst):
            dur = ctx.req[req_id]["duration_periods"]
            for p in range(a, a + dur):
                cell_cands[(rid, day, p)].append((req_id, i))
    for _cell, lst in cell_cands.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                if lst[i][0] == lst[j][0]:
                    continue
                model.AddBoolOr([sel_vars[lst[i][0]][lst[i][1]].Not(),
                                 sel_vars[lst[j][0]][lst[j][1]].Not()])

    n = len(others)
    rank_bonus = {req_id: n - i for i, (req_id, _) in enumerate(others)}
    obj = []
    for req_id, req in others:
        if req_id not in sel_vars:
            continue
        w = CAT_WEIGHT[ctx.effective_category(data, req)] * 1000 + rank_bonus[req_id]
        for i in range(len(cands[req_id])):
            obj.append(w * sel_vars[req_id][i])

    chosen: dict[str, tuple[str, str, int]] = {}
    if has_vars:
        model.Maximize(cp_model.LinearExpr.Sum(obj))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_search_workers = 8
        status = solver.Solve(model)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for req_id, req in others:
                if req_id not in sel_vars:
                    continue
                for i in range(len(cands[req_id])):
                    if solver.Value(sel_vars[req_id][i]):
                        chosen[req_id] = cands[req_id][i]
                        break

    for req_id, req in others:
        if req_id in ctx.cancelled or req_id not in chosen:
            continue
        rid, day, a = chosen[req_id]
        dur = req["duration_periods"]
        place(req, "approved",
              f"{ctx.effective_category(data, req)}; {rid} free "
              f"{day} P{a}-P{a + dur - 1} (priority-ordered allocation).",
              rid, day, a, a + dur - 1)

    # ---------- 3. alternatives / rejections for the rest ----------
    for req_id, req in others:
        if req_id in ctx.cancelled or req_id in decisions:
            continue
        dur = req["duration_periods"]
        rooms = _candidate_rooms(ctx, req)
        alt = _first_alt(ctx, req, room_busy, week_grp, rooms)
        if alt:
            ar, ad, aa = alt
            place(req, "alternative_offered",
                  "Requested window not available after higher-priority decisions; "
                  f"offered in {ar} {ad} P{aa}-P{aa + dur - 1} instead.",
                  ar, ad, aa, aa + dur - 1)
        else:
            place(req, "rejected",
                  "; ".join(_reject_reasons(ctx, req, room_busy, week_grp, rooms)))

    # ---------- 4. cancelled requests ----------
    for req_id, req in reqs:
        if req_id in ctx.cancelled:
            place(req, "rejected",
                  "Request was cancelled by the requester; it can no longer be approved.")

    fest = {"bookings": [decisions[rid] for rid in ctx.req if rid in decisions],
            "session_overrides": overrides_out}
    report = checks.booking_report(ctx, week_assign, fest)
    meta = {"stats": report["stats"], "violations": report["violations"],
            "warnings": report["warnings"]}
    return fest, meta
