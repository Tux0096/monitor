#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a
echo "== GET /updates =="
curl -sS -H "Authorization: ${MAX_BOT_TOKEN}" "https://platform-api.max.ru/updates?limit=5&types=message_created" | head -c 2000
echo
