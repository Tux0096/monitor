#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a
SECRET="${PERFORMANCE_IMPORT_SECRET//$'\r'/}"
FROM="$(date -d '30 days ago' +%F)"
TO="$(date -d yesterday +%F)"
echo "Import ${FROM}..${TO} force=true"
curl -sS --max-time 600 -X POST \
  -H "x-monitor-import-secret: ${SECRET}" \
  "http://127.0.0.1:3080/api/firebase/performance/import?from=${FROM}&to=${TO}&force=true"
echo
