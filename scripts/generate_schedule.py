#!/usr/bin/env python3
"""Generate exports/schedule.json by running the app's solver pipeline.

This is the same code path the web app's Admin 'Export' button uses — the
export is never created by hand.
"""
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.dataset.models import Context, load_json  # noqa: E402
from app.solver.pipeline import build_schedule  # noqa: E402
from app.validation import checks  # noqa: E402


def main() -> int:
    team = os.environ.get("TEAM_NAME", "Spectra Solvers")
    data = load_json(REPO / "backend" / "app" / "data" / "cit_public.json")
    ctx = Context.build(data)
    t0 = time.time()
    sched, report, meta = build_schedule(ctx, team)
    dt = time.time() - t0

    out = REPO / "exports" / "schedule.json"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(sched, f, indent=2)

    print(f"solved in {dt:.1f}s  (sessions: {meta['assignments']})")
    print(f"hard violations : {report['hard_violation_count']}  {report['hard_by_rule']}")
    print(f"soft penalty    : {report['soft_total']}  {report['soft_penalties']}")
    if "bookings" in report:
        b = report["bookings"]
        print(f"bookings score  : {b['booking_score']} (max {b['booking_score_max_if_all_approved']})"
              f"  approved {b['approved']} / alt {b['alternatives']} / rejected {b['rejected']}"
              f"  overrides {b['session_overrides']}  inversions {len(b['priority_inversions'])}")
    if "exam_soft_penalty" in report:
        print(f"exam soft       : {report['exam_soft_penalty']}")
    if report["hard_violation_count"]:
        for v in report["hard_violations"][:20]:
            print(f"  [{v['rule']}] {v['detail']}")
        return 1
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
