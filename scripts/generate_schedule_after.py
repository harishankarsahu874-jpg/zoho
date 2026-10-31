#!/usr/bin/env python3
"""Generate exports/schedule_after.json: apply examples/sample_disruption.json
to the dataset, then repair the baseline exports/schedule.json with the
least-moves rescheduler. Same code path as the app's change-approval flow.
"""
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.dataset.models import Context, apply_disruption, load_json  # noqa: E402
from app.solver.pipeline import build_schedule_after, explain_conflicts  # noqa: E402
from app.solver.timetable import TimetableInfeasible  # noqa: E402


def main() -> int:
    team = os.environ.get("TEAM_NAME", "Spectra Solvers")
    data = load_json(REPO / "backend" / "app" / "data" / "cit_public.json")
    dis = load_json(REPO / "examples" / "sample_disruption.json")
    baseline_path = REPO / "exports" / "schedule.json"
    if not baseline_path.exists():
        print("exports/schedule.json missing - run scripts/generate_schedule.py first")
        return 2
    baseline = load_json(baseline_path)

    disrupted = apply_disruption(data, dis)
    ctx = Context.build(disrupted)
    t0 = time.time()
    try:
        sched, report, meta = build_schedule_after(ctx, baseline, team)
    except TimetableInfeasible:
        print("NO VALID FIX EXISTS for this disruption. Conflicting changes:")
        for p in explain_conflicts(ctx, dis):
            print("  -", p)
        return 1
    dt = time.time() - t0

    out = REPO / "exports" / "schedule_after.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(sched, f, indent=2)

    print(f"repaired in {dt:.1f}s")
    print(f"hard violations : {report['hard_violation_count']}  {report['hard_by_rule']}")
    print(f"soft penalty    : {report['soft_total']}  {report['soft_penalties']}")
    st = meta.get("stability", {})
    print(f"stability       : {st.get('sessions_moved')} sessions moved "
          f"({st.get('time_changed')} time, {st.get('room_only_changed')} room only)")
    if "bookings" in report:
        b = report["bookings"]
        print(f"bookings score  : {b['booking_score']}  inversions {len(b['priority_inversions'])}")
    if report["hard_violation_count"]:
        for v in report["hard_violations"][:20]:
            print(f"  [{v['rule']}] {v['detail']}")
        return 1
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
