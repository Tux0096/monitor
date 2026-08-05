#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor
set -a
source .env.local
set +a
SECRET="${PERFORMANCE_IMPORT_SECRET//$'\r'/}"

FROM="${1:-$(date -d yesterday +%F)}"
TO="${2:-$FROM}"

code=$(curl -sS -o /tmp/import-result.json -w "%{http_code}" -X POST \
  -H "x-monitor-import-secret: ${SECRET}" \
  "http://127.0.0.1:3080/api/firebase/performance/import?from=${FROM}&to=${TO}")
echo "HTTP ${code}"
head -c 800 /tmp/import-result.json
echo
