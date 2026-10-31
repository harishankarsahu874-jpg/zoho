#!/usr/bin/env bash
# Local dev launcher: backend (uvicorn :8000) + frontend (vite :5173).
set -e
cd "$(dirname "$0")"

# --- backend deps
if [ ! -d backend/.venv ]; then
  python3 -m venv backend/.venv
fi
# shellcheck disable=SC1091
source backend/.venv/bin/activate
pip install -q -r backend/requirements.txt

# --- frontend deps
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install)
fi

# .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example (fill in OPENAI_API_KEY optionally)"
fi

trap 'kill 0' EXIT
(cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000) &
(cd frontend && npm run dev -- --host 0.0.0.0 --port 5173) &
wait
