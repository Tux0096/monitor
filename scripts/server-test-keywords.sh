#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor/.next/standalone
set -a
source /opt/monitor/.env.local
set +a

SECRET="${MAX_BOT_WEBHOOK_SECRET//$'\r'/}"

test_case() {
  local name="$1"
  local text="$2"
  local mid="mid.debug.$(date +%s).$RANDOM"
  PAYLOAD=$(cat <<EOF
{
  "update_type": "message_created",
  "message": {
    "recipient": { "chat_id": -100123456, "chat_type": "chat" },
    "body": { "mid": "$mid", "text": "$text" },
    "sender": { "user_id": 424242, "first_name": "Тест", "last_name": "Курьер", "is_bot": false }
  }
}
EOF
)
  code=$(curl -sS -o /tmp/wb.json -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "x-max-bot-api-secret: ${SECRET}" \
    -d "$PAYLOAD" \
    "http://127.0.0.1:3080/api/max/webhook")
  echo "$name => HTTP $code $(cat /tmp/wb.json)"
}

test_case "keyword1" "не работает мобильное приложение"
sleep 1
test_case "keyword2" "не работает приложение имуков"
