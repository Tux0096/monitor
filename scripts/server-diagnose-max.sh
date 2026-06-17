#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a

echo "== jq =="
command -v jq || echo "jq MISSING"

echo "== subscriptions =="
curl -sS -m 10 -H "Authorization: ${MAX_BOT_TOKEN}" https://platform-api.max.ru/subscriptions
echo

echo "== updates (timeout 5) =="
curl -sS -m 15 -H "Authorization: ${MAX_BOT_TOKEN}" "https://platform-api.max.ru/updates?timeout=5&limit=10&types=message_created" | head -c 3000
echo

echo "== bot info =="
curl -sS -m 10 -H "Authorization: ${MAX_BOT_TOKEN}" https://platform-api.max.ru/me 2>/dev/null | head -c 500
echo

echo "== poller process =="
ps aux | grep max-poller | grep -v grep
