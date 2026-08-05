#!/usr/bin/env bash
set -euo pipefail
APP="/opt/monitor"
SRC="/opt/monitor/src"
PORT="$(grep '^MONITOR_PORT=' "${APP}/.env.local" | cut -d= -f2- | tr -d '\r' | tr -d ' ')"
PORT="${PORT:-3080}"

chmod -R u+w "${APP}/.next" 2>/dev/null || true
rm -rf "${APP}/.next"
mkdir -p "${APP}/.next"
cp -R "${SRC}/.next/standalone" "${APP}/.next/standalone"
mkdir -p "${APP}/.next/standalone/.next"
cp -R "${SRC}/.next/static" "${APP}/.next/standalone/.next/static"
cp "${APP}/.env.local" "${APP}/.next/standalone/.env.local"
pm2 restart monitor
sleep 2
curl -sS -o /dev/null -w "http=%{http_code}\n" "http://127.0.0.1:${PORT}"
