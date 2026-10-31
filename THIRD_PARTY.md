# Third-Party Components

Every external library / tool this project depends on, what it is used for, and
its license. Versions are pinned to minimums in `backend/requirements.txt` and
`frontend/package.json`.

---

## Official starter-pack component (unmodified)

| Component | Used for | License / provenance |
|-----------|----------|----------------------|
| `validator/validator.py` | **The single source of truth for validity.** Hard constraints H1–H14, soft scores S1–S6, booking decisions, exam checks, stability diff. Our `backend/app/validation/checks.py` wraps this file directly. | Provided by the Crunch Week hackathon starter pack. **Not modified in any way.** |
| `backend/app/data/cit_public.json` | The public dataset (`cit-public-v1`) that the platform solves. | Starter pack dataset. |
| `examples/*` | Sample disruption, sample requests, export shape reference. | Starter pack. |

---

## Backend (Python)

| Library | Minimum version | Used for | License |
|---------|----------------|----------|---------|
| `ortools` (Google OR-Tools) | 9.10 | CP-SAT solver for the two-phase timetable (time then rooms), exam allocation, and booking-slot allocation; the core optimisation engine | Apache-2.0 |
| `fastapi` | 0.110 | REST API framework | MIT |
| `uvicorn[standard]` | 0.29 | ASGI server that runs the API | BSD-3 |
| `sqlalchemy` | 2.0 | ORM + connection handling | MIT |
| `pydantic` / `pydantic-settings` | 2.6 / 2.2 | Request/response models + settings from env | MIT |
| `python-jose[cryptography]` | 3.3 | JWT encode/decode for auth | MIT |
| `bcrypt` | 4.0 | Password hashing for the demo accounts | BSD-3 |
| `python-multipart` | 0.0.9 | Multipart form parsing (dataset upload) | BSD-3 |
| SQLite (Python stdlib `sqlite3`) | — | Demo persistence (no external server) | Public domain |

The LLM is called with the Python **standard library** only (`urllib`) — no
OpenAI SDK dependency.

---

## Frontend (Node)

| Library | Minimum version | Used for | License |
|---------|----------------|----------|---------|
| `react` / `react-dom` | 18.3 | UI framework | MIT |
| `react-router-dom` | 6.26 | Client-side routing | MIT |
| `vite` | 5.4 | Dev server + bundler (proxies `/api` → FastAPI) | MIT |
| `@vitejs/plugin-react` | 4.3 | React support for Vite | MIT |

Styling is a hand-written CSS design system (`frontend/src/styles.css`) — no
Tailwind or other CSS framework.

---

## Development / tooling

| Tool | Used for | License |
|------|----------|---------|
| Python 3.11 (interpreter) | Running backend + validator | PSF license |
| Node.js 22 / npm | Building & serving the frontend | MIT / various |
| Arena.ai Agent Mode | Coding assistance during development (declared in `AI_USAGE.md`) | — |

---

## What we did **not** use

- No OpenAI SDK or other AI SDK (only stdlib `urllib`).
- No commercial scheduling/solver service — all optimisation is local
  OR-Tools CP-SAT running inside this repo.
- No external fonts/CDNs required for the app to function offline
  (the optional Google Fonts `<link>` degrades gracefully to system fonts).
- No data is sent to any third party except the explicitly-configured,
  optional LLM endpoint described in `AI_USAGE.md`.
