#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/monitor"
ENV_FILE="${ROOT}/.env.local"
PORT="${MONITOR_PORT:-3080}"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

DRY_RUN="${DRY_RUN:-0}"
SKIP_MAX="${SKIP_MAX_REPLAY:-0}"
SKIP_ORPHANS="${SKIP_ORPHANS:-0}"

query="dryRun=${DRY_RUN}"
if [[ "${SKIP_MAX}" == "1" ]]; then
  query="${query}&skipMaxReplay=1"
fi
if [[ "${SKIP_ORPHANS}" == "1" ]]; then
  query="${query}&skipOrphans=1"
fi

secret="${MAX_BOT_ADMIN_SECRET:-${PERFORMANCE_IMPORT_SECRET:-}}"
if [[ -z "${secret}" ]]; then
  echo "ERROR: MAX_BOT_ADMIN_SECRET or PERFORMANCE_IMPORT_SECRET required" >&2
  exit 1
fi

echo "== sync appeals (dryRun=${DRY_RUN}) =="
curl -sS -m 600 -X POST \
  -H "x-max-admin-secret: ${secret}" \
  "http://127.0.0.1:${PORT}/api/internal/sync-appeals?${query}"
echo

echo "== stats =="
node "${ROOT}/src/scripts/server-appeals-stats.mjs"
