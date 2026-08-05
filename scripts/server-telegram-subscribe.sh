#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a

PORT="${MONITOR_PORT//$'\r'/}"
PORT="${PORT:-3080}"
ADMIN="${TELEGRAM_BOT_ADMIN_SECRET:-${MAX_BOT_ADMIN_SECRET//$'\r'/}}"

code=$(curl -sS -o /tmp/telegram-subscribe-result.json -w "%{http_code}" -X POST \
  -H "x-telegram-admin-secret: ${ADMIN}" \
  "http://127.0.0.1:${PORT}/api/telegram/subscribe")
echo "HTTP ${code}"
cat /tmp/telegram-subscribe-result.json 2>/dev/null
echo
