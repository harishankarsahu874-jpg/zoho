# ≤ 5-minute demo video — shot list

Record with the deployed link (or `npm run dev` + `uvicorn` locally). Total
target: **4m30s–5m00s**. Same browser session throughout; no cuts that hide
anything.

| # | Time | What to show | Narration beats |
|---|------|--------------|-----------------|
| 1 | 0:00–0:25 | Login page → one-click **Admin** login | "CrunchWeek solves CIT's Week 7: 189 sessions, 27 rooms, 41 exams, 25 fest bookings — one engine, validator-checked." |
| 2 | 0:25–1:00 | Dashboard: 0 hard conflicts, soft score, booking score, room utilisation bars | "Every change is re-validated by the official validator before it is accepted — this is the live state, 0 hard violations." |
| 3 | 1:00–1:40 | Timetable → whole-week grid → switch to **by group** (Y1-A) and **by faculty** (F07); hover a chip, click **why?** | "Timetables by group, faculty and room. Ask 'why?' on any session and the platform explains the placement from its own constraint report." |
| 4 | 1:40–2:30 | Sign out → **Club** login → Fest Week → "Describe it": type `Dramatics society ko Friday shaam 6 baje se 2 ghante ke liye auditorium chahiye, 150 log, projector aur mic` → Parse → editable draft → Submit | "Plain Hinglish in, structured editable booking out. The LLM only drafts — the user confirms." |
| 5 | 2:30–3:00 | Sign out → **Coordinator** login → Fest Week → click the club's pending request → **decide** → try the requested AUD slot → server blocks it ("BR-15 holds it") → pick a valid room/slot → approve | "Decisions are explainable and constraint-checked: a bad placement is refused with the exact conflict; a valid one is recorded with a reason." |
| 6 | 3:00–4:00 | **Changes** page (as faculty or coordinator): type `F07 is on leave all Monday` (or use the structured form: CR-101 maintenance) → wait for proposal → **view diff** (old → new, N moved) → sign out → **Admin** → approve | "A disruption becomes a least-moves proposal: exactly which sessions moved and where, 0 hard violations, applied only after Admin approval." |
| 7 | 4:00–4:30 | Admin page: **Generate timetable** button (job progress), **Export schedule.json**, priority-order editor, audit log, **Reset demo data** | "Admin can regenerate from scratch, export the submission file, reorder booking priority, and audit every action." |
| 8 | 4:30–5:00 | AI Assistant: ask "Why was BR-17 not approved?" / "Which rooms are most used?" | "The assistant answers from stored facts — and if no LLM key is set, the deterministic fallback keeps it working." |

**Tips**
- Keep the browser at 100% zoom; use the dev-tools device toolbar only if the
  sidebar crowds the frame.
- If a solve is running during recording, keep the tab visible with the
  progress spinner — it is a feature (background job + polling).
- End on the dashboard with 0 hard violations visible.
