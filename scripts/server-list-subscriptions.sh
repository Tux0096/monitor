#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a
curl -sS -H "Authorization: ${MAX_BOT_TOKEN}" https://platform-api.max.ru/subscriptions
echo
