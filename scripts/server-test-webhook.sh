#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a

SECRET="${MAX_BOT_WEBHOOK_SECRET//$'\r'/}"
PAYLOAD='{
  "update_type": "message_created",
  "timestamp": 1739184000000,
  "message": {
    "recipient": {
      "chat_id": -100123456,
      "chat_type": "chat"
    },
    "body": {
      "mid": "mid.test.'$(date +%s)'",
      "text": "тестовое обращение из скрипта"
    },
    "sender": {
      "user_id": 999001,
      "first_name": "Тест",
      "is_bot": false,
      "name": "Тест Курьер"
    }
  }
}'

code=$(curl -sS -o /tmp/webhook-test.json -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "x-max-bot-api-secret: ${SECRET}" \
  -d "${PAYLOAD}" \
  "http://127.0.0.1:3080/api/max/webhook")
echo "HTTP ${code}"
cat /tmp/webhook-test.json
echo
