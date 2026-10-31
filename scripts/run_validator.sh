#!/usr/bin/env bash
# Check both exports with the official validator (unmodified starter-pack file).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 validator/validator.py \
  --data backend/app/data/cit_public.json \
  --schedule exports/schedule.json
echo
python3 validator/validator.py \
  --data backend/app/data/cit_public.json \
  --schedule exports/schedule_after.json \
  --disruption examples/sample_disruption.json \
  --baseline exports/schedule.json
