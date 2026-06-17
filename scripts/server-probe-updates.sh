#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a

for marker in "" "18400" "18449"; do
  echo "== marker=${marker:-null} =="
  if [ -z "$marker" ]; then
    curl -sS -m 15 -H "Authorization: ${MAX_BOT_TOKEN}" \
      "https://platform-api.max.ru/updates?timeout=3&limit=5" | head -c 2500
  else
    curl -sS -m 15 -H "Authorization: ${MAX_BOT_TOKEN}" \
      "https://platform-api.max.ru/updates?timeout=3&limit=5&marker=${marker}" | head -c 2500
  fi
  echo
  echo "---"
done
