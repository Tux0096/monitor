#!/usr/bin/env bash
set -euo pipefail
cd /opt/monitor

PORT=$(grep '^MONITOR_PORT=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d ' ')
PORT="${PORT:-3080}"
SECRET=$(grep '^PERFORMANCE_IMPORT_SECRET=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d ' ')

if [ -z "${SECRET}" ]; then
  echo "no_import_secret"
  exit 0
fi

LINE="15 3 * * * curl -fsS -X POST -H \"x-monitor-import-secret: ${SECRET}\" \"http://127.0.0.1:${PORT}/api/firebase/performance/import\" >> /opt/monitor/import.log 2>&1"
# Синтетический мониторинг сайта и МП — каждый час (живые замеры времени отклика)
PROBE_LINE="5 * * * * curl -fsS -X POST -H \"x-monitor-import-secret: ${SECRET}\" \"http://127.0.0.1:${PORT}/api/monitoring/probe\" >> /opt/monitor/probe.log 2>&1"

TMP=$(mktemp)
crontab -l 2>/dev/null \
  | grep -v '/api/firebase/performance/import' \
  | grep -v '/api/monitoring/probe' > "${TMP}" || true
echo "${LINE}" >> "${TMP}"
echo "${PROBE_LINE}" >> "${TMP}"
crontab "${TMP}"
rm -f "${TMP}"

echo "cron_installed"
crontab -l | grep -cE 'performance/import|monitoring/probe'
