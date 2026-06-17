#!/usr/bin/env bash
set -euo pipefail
ROOT="/opt/monitor"
cd "${ROOT}/.next/standalone"
if [ -f "${ROOT}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env.local"
  set +a
fi
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3080}"
exec node server.js
