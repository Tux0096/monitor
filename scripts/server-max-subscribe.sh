#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a

PORT="${MONITOR_PORT//$'\r'/}"
PORT="${PORT:-3080}"
ADMIN="${MAX_BOT_ADMIN_SECRET//$'\r'/}"
TOKEN="${MAX_BOT_TOKEN//$'\r'/}"

echo "token_len=${#TOKEN} admin_len=${#ADMIN} port=${PORT}"

code=$(curl -sS -o /tmp/max-subscribe-result.json -w "%{http_code}" -X POST \
  -H "x-max-admin-secret: ${ADMIN}" \
  "http://127.0.0.1:${PORT}/api/max/subscribe")
echo "HTTP ${code}"
cat /tmp/max-subscribe-result.json 2>/dev/null
echo
