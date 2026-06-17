#!/usr/bin/env bash
set -euo pipefail

cd /opt/monitor
set -a
source .env.local
set +a

PORT="${MONITOR_PORT//$'\r'/}"
PORT="${PORT:-3080}"
SECRET="${MAX_BOT_WEBHOOK_SECRET//$'\r'/}"
TOKEN="${MAX_BOT_TOKEN//$'\r'/}"
MARKER_FILE="/opt/monitor/max-poll-marker.txt"
WEBHOOK_URL="https://it.franchise-fuji.ru/api/max/webhook"

echo "max-poller: removing webhook subscription (polling mode)"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${WEBHOOK_URL}', safe=''))")
curl -sS -X DELETE -H "Authorization: ${TOKEN}" \
  "https://platform-api.max.ru/subscriptions?url=${ENCODED}" || true
echo

MARKER=""
if [ -f "${MARKER_FILE}" ]; then
  MARKER="$(tr -d '\r\n' < "${MARKER_FILE}")"
fi

echo "max-poller: started marker=${MARKER:-none}"

while true; do
  URL="https://platform-api.max.ru/updates?timeout=25&limit=50&types=message_created"
  if [ -n "${MARKER}" ]; then
    URL="${URL}&marker=${MARKER}"
  fi

  RESP="$(curl -sS -H "Authorization: ${TOKEN}" "${URL}" || echo '{}')"

  COUNT="$(echo "${RESP}" | jq -r '.updates | length // 0' 2>/dev/null || echo 0)"
  if [ "${COUNT}" != "0" ] && [ "${COUNT}" != "null" ]; then
    echo "$(date -Is) updates=${COUNT}"
    while IFS= read -r update; do
      [ -z "${update}" ] && continue
      curl -sS -X POST \
        -H "Content-Type: application/json" \
        -H "x-max-bot-api-secret: ${SECRET}" \
        -d "${update}" \
        "http://127.0.0.1:${PORT}/api/max/webhook" >/dev/null || true
    done < <(echo "${RESP}" | jq -c '.updates[]?')
  fi

  NEW_MARKER="$(echo "${RESP}" | jq -r '.marker // empty' 2>/dev/null || true)"
  if [ -n "${NEW_MARKER}" ] && [ "${NEW_MARKER}" != "null" ]; then
    MARKER="${NEW_MARKER}"
    echo "${MARKER}" > "${MARKER_FILE}"
  fi

  sleep 1
done
