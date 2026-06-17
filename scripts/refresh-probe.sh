#!/usr/bin/env bash
set -uo pipefail
cd /opt/monitor
PGURL="$(grep '^MONITOR_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')"
SECRET="$(grep '^PERFORMANCE_IMPORT_SECRET=' .env.local | cut -d= -f2- | tr -d '\r' | tr -d ' ')"
PORT="$(grep '^MONITOR_PORT=' .env.local | cut -d= -f2- | tr -d '\r' | tr -d ' ')"
PORT="${PORT:-3080}"

echo "=== delete old/wrong mobile probe metrics ==="
psql "${PGURL}" -c "DELETE FROM firebase_performance_daily WHERE app IN ('probe:app') OR (app = 'probe:ru.fuji.app' AND metric_name LIKE '%Поиск%') OR (app = 'probe:ru.fuji.app' AND metric_name LIKE '%Профиль%');"

echo "=== run fresh probe ==="
curl -sS --max-time 120 -X POST -H "x-monitor-import-secret: ${SECRET}" "http://127.0.0.1:${PORT}/api/monitoring/probe"
echo

echo "=== current probe metrics ==="
psql "${PGURL}" -P pager=off -c "SELECT source_type, metric_name, round(avg_ms::numeric,0) AS avg_ms, samples FROM firebase_performance_daily WHERE day=CURRENT_DATE AND app IN ('probe:site','probe:ru.fuji.app') ORDER BY source_type, metric_name;"
