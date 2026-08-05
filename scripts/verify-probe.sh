#!/usr/bin/env bash
set -uo pipefail
cd /opt/monitor
PGURL="$(grep '^MONITOR_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')"
echo "=== rows by source_type for today ==="
psql "${PGURL}" -P pager=off -c \
  "SELECT source_type, app, metric_name, round(avg_ms::numeric,0) AS avg_ms, samples
     FROM firebase_performance_daily
    WHERE day = CURRENT_DATE
    ORDER BY source_type, app, metric_name;"
echo "=== totals (last 30d incl today) ==="
psql "${PGURL}" -P pager=off -c \
  "SELECT source_type, count(*) FILTER (WHERE day=CURRENT_DATE) AS today_rows,
          count(*) AS rows_30d
     FROM firebase_performance_daily
    WHERE day >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY source_type;"
