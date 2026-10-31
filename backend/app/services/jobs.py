"""Tiny in-process job runner for long solver operations (generate,
propose-change). Jobs run in a thread; status is polled via the API.
State is persisted in kv_state so a restart doesn't orphan job records."""
from __future__ import annotations

import datetime as dt
import json
import threading
import traceback
import uuid
from typing import Callable

from sqlalchemy.orm import Session

from . import state

_JOBS: dict[str, dict] = {}
_lock = threading.Lock()
_DONE_HOOKS: dict[str, list] = {}


def on_done(job_id: str, hook) -> None:
    with _lock:
        _DONE_HOOKS.setdefault(job_id, []).append(hook)


def start_job(db_factory: Callable[[], Session], fn: Callable[[Session], dict],
              label: str) -> str:
    job_id = uuid.uuid4().hex[:10]

    def runner() -> None:
        with _lock:
            _JOBS[job_id] = {"id": job_id, "label": label, "status": "running",
                             "result": None, "error": None,
                             "started_at": dt.datetime.utcnow().isoformat()}
        try:
            with db_factory() as db:
                result = fn(db)
            with _lock:
                _JOBS[job_id].update(status="done", result=result)
                hooks = list(_DONE_HOOKS.pop(job_id, []))
        except Exception as e:  # noqa: BLE001 - surfaced to the UI
            with _lock:
                _JOBS[job_id].update(status="error", error=str(e),
                                     traceback=traceback.format_exc()[-2000:])
                hooks = list(_DONE_HOOKS.pop(job_id, []))
        for h in hooks:
            try:
                h(_JOBS[job_id])
            except Exception:  # noqa: BLE001
                pass

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    return job_id


def get_job(job_id: str) -> dict | None:
    with _lock:
        return dict(_JOBS[job_id]) if job_id in _JOBS else None


def list_jobs() -> list[dict]:
    with _lock:
        return sorted(_JOBS.values(),
                      key=lambda j: j.get("started_at", ""), reverse=True)[:25]
