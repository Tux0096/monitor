#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a

OLD_URL="https://stat.franchise-fuji.ru/api/max/webhook"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$OLD_URL', safe=''))")

echo "Removing old subscription: $OLD_URL"
curl -sS -X DELETE \
  -H "Authorization: ${MAX_BOT_TOKEN}" \
  "https://platform-api.max.ru/subscriptions?url=${ENCODED}"
echo
echo "Remaining:"
curl -sS -H "Authorization: ${MAX_BOT_TOKEN}" https://platform-api.max.ru/subscriptions
echo
