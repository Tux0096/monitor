#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="${1:-/opt/monitor/.env.local}"
SECRET=$(grep '^PERFORMANCE_IMPORT_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
if [ -z "$SECRET" ]; then
  echo "missing_secret"
  exit 1
fi
code=$(curl -s -o /tmp/perf-report.json -w '%{http_code}' \
  -H "x-monitor-import-secret: ${SECRET}" \
  http://127.0.0.1:3080/api/internal/performance/report)
echo "internal_http=${code}"
if [ "$code" = "200" ]; then
  python3 - <<'PY'
import json
with open("/tmp/perf-report.json") as f:
    data = json.load(f)
print("pages", len(data.get("pages", [])))
PY
fi
push_code=$(curl -s -o /tmp/push-check.json -w '%{http_code}' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-monitor-import-secret: ${SECRET}" \
  --data-binary @/tmp/perf-report.json \
  http://127.0.0.1:3103/push/v1/alerts/evaluate-performance)
echo "evaluate_http=${push_code}"
head -c 160 /tmp/push-check.json 2>/dev/null || true
echo
