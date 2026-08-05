#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a
SECRET="${PERFORMANCE_IMPORT_SECRET//$'\r'/}"

FROM="${1:-$(date -d '30 days ago' +%F)}"
TO="${2:-$(date -d yesterday +%F)}"
FORCE="${3:-1}"

echo "Import performance ${FROM}..${TO} force=${FORCE}"
code=$(curl -sS -o /tmp/import-result.json -w "%{http_code}" -X POST \
  -H "x-monitor-import-secret: ${SECRET}" \
  "http://127.0.0.1:3080/api/firebase/performance/import?from=${FROM}&to=${TO}&force=${FORCE}")
echo "HTTP ${code}"
cat /tmp/import-result.json
echo
