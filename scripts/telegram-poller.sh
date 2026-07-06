#!/usr/bin/env bash
set -euo pipefail

cd /opt/monitor
set -a
source .env.local
set +a

PORT="${MONITOR_PORT//$'\r'/}"
PORT="${PORT:-3080}"
SECRET="${TELEGRAM_BOT_WEBHOOK_SECRET//$'\r'/}"
TOKEN="${TELEGRAM_BOT_TOKEN//$'\r'/}"
IP="${TELEGRAM_API_IP:-149.154.167.220}"
OFFSET_FILE="/opt/monitor/telegram-poll-offset.txt"
LOG_FILE="/opt/monitor/telegram-poller.log"
RESOLVE=(--resolve "api.telegram.org:443:${IP}")

log() {
  echo "$(date -Is) $*" | tee -a "${LOG_FILE}"
}

api() {
  local method="$1"
  shift
  curl -sS "${RESOLVE[@]}" --connect-timeout 15 --max-time 60 \
    -X POST "https://api.telegram.org/bot${TOKEN}/${method}" "$@"
}

log "telegram-poller: deleteWebhook (switch to polling)"
api deleteWebhook -H "Content-Type: application/json" -d '{"drop_pending_updates":false}' || true

OFFSET="0"
if [ -f "${OFFSET_FILE}" ]; then
  OFFSET="$(tr -d '\r\n' < "${OFFSET_FILE}")"
fi

log "telegram-poller: started offset=${OFFSET}"

while true; do
  RESP="$(curl -sS "${RESOLVE[@]}" --connect-timeout 15 --max-time 65 \
    "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=25&offset=${OFFSET}&allowed_updates=%5B%22message%22%5D" \
    || echo '{"ok":false,"result":[]}')"

  COUNT="$(echo "${RESP}" | jq -r '.result | length // 0' 2>/dev/null || echo 0)"
  if [ "${COUNT}" != "0" ] && [ "${COUNT}" != "null" ]; then
    log "updates=${COUNT}"
    while IFS= read -r update; do
      [ -z "${update}" ] && continue
      UPDATE_ID="$(echo "${update}" | jq -r '.update_id // empty')"
      HTTP="$(curl -sS -o /tmp/telegram-forward.json -w '%{http_code}' -X POST \
        -H "Content-Type: application/json" \
        -H "x-telegram-bot-api-secret-token: ${SECRET}" \
        -d "${update}" \
        "http://127.0.0.1:${PORT}/api/telegram/webhook" || echo 000)"
      log "forward update_id=${UPDATE_ID} -> HTTP ${HTTP}"
      if [ -n "${UPDATE_ID}" ] && [ "${UPDATE_ID}" != "null" ]; then
        NEXT=$((UPDATE_ID + 1))
        if [ "${NEXT}" -gt "${OFFSET}" ]; then
          OFFSET="${NEXT}"
          echo "${OFFSET}" > "${OFFSET_FILE}"
        fi
      fi
    done < <(echo "${RESP}" | jq -c '.result[]?')
  fi

  sleep 1
done
