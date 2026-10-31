# AI Usage Declaration

**Team:** Spectra Solvers · **Project:** Crunch Week — CIT Campus Scheduling & Venue Management

This document declares **every AI system used to build this project and by the
project at runtime**, and — most importantly — the **boundary of AI authority**:
what an AI may do here, and what it may never decide.

---

## 1. The rule that governs everything

> **Validity is decided by code, never by AI.**

No output of any large language model (LLM) is trusted for correctness. Every
schedule, booking placement, exam slot or change proposal produced in this
platform — whether suggested by an LLM, typed by a user, or computed by our
solver — must pass the platform's own constraint engine
(`backend/app/validation/`, which wraps the official starter-pack validator
`validator/validator.py`, unmodified) **before** it can change any data or be
shown as valid. The LLM has no code path that writes to the timetable, the
booking log, or the exam schedule directly.

---

## 2. AI used to BUILD this project

| What | Tool / model | How it was used |
|------|--------------|-----------------|
| Scaffolding and implementation assistance during development | Arena.ai Agent Mode coding agent (multi-model: Claude/ChatGPT/Gemini-class assistants) | Drafted and debugged backend/frontend/solver code in the repository. All generated code was reviewed, tested against the official validator, and committed by the team. No dataset or key material was shared outside the sandbox. |

No other third-party AI services were used to build the project. No parts of
the dataset, the solution, or user data were used to train or fine-tune any model.

---

## 3. AI used by the product at RUNTIME

The runtime uses **one** LLM interface: an **OpenAI-compatible chat API**
(`POST {OPENAI_BASE_URL}/chat/completions`), called from
`backend/app/ai/llm_client.py` (plain `urllib`, no SDK).

- **Default model:** `gpt-4o-mini` (configurable via `LLM_MODEL`)
- **Key:** `OPENAI_API_KEY` (optional; see `.env.example`)
- **No data leaves the request:** prompts contain the user's request text and a
  small read-only context summary (counts, decision statuses). We never send
  raw dataset internals or credentials.

### Where the LLM is called (all optional, all with deterministic fallback)

| Endpoint | LLM task | Deterministic fallback (no key / API down) |
|----------|----------|--------------------------------------------|
| `POST /api/bookings/ai-draft` | Convert plain English / Hinglish venue request into a **structured draft** (day, periods, size, room types, features) | In-repo rule-based parser (`backend/app/ai/parser.py`) with Hinglish word lists; emits follow-up questions when information is missing |
| `POST /api/ai/change` | Convert a natural-language schedule change ("F07 is on leave Monday") into the dataset **change-file format** | In-repo rule-based parser (`backend/app/ai/change_parser.py`) matching faculty/room/session ids and day/period phrases |
| `POST /api/ai/ask` | Answer questions about the current schedule **using only provided context** | Deterministic template answers built from the stored solution + validator report |
| `POST /api/ai/explain` | Rewrite stored decision reasons (status, rule, numbers) into a friendly explanation **using only the given facts** | Deterministic explanation composed from the official validator output and stored decision reasons |

### What the LLM may NEVER decide

- Whether a timetable / booking / exam schedule is **valid** (validator only)
- **Which room, day or period** a booking or session gets (solver / human only;
  the LLM draft is an *editable proposal*, not a placement)
- **Priority order** or any dataset content
- Whether a change request is **approved or rejected** (admin only)
- Any override of a rejected higher-priority booking (engine-enforced rule)

Guardrails in code:
- LLM parsing output is **schema-checked and id-verified** (unknown faculty /
  room / session ids are dropped, not invented) before it becomes a draft.
- A booking draft can only be *submitted*; its placement is validated
  server-side (`_cell_free` + room type/capacity/feature checks) at decision time.
- Every LLM explanation is built from facts serialized by our own code
  (validator report, decision records); the model is instructed to add no new facts.
- If the API fails, times out, or returns non-JSON, the request falls back to
  the deterministic path and the response is flagged `llm_used: false`.

---

## 4. How to verify the boundary

1. `grep -rn "openai\|chat.completions" backend/app` → the only LLM calls are
   in `backend/app/ai/llm_client.py`; every caller catches `LLMUnavailable`.
2. `backend/app/validation/checks.py` → validity comes exclusively from
   `validator/validator.py` (starter pack, byte-identical, unmodified).
3. Run with **no** `OPENAI_API_KEY` set: every AI-labelled feature still works
   via the rule-based fallback (the deployed demo runs exactly this way by
   default).

---

*Declaration: no AI was used to fabricate data, results, or validity
statements. All hard-constraint and scoring claims in this submission are
produced by the official validator.*
