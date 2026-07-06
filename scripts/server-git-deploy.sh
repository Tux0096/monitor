#!/usr/bin/env bash
# Сборка и деплой monitor-dashboard прямо на сервере из git.
# Идемпотентно: если новых коммитов нет — выходит сразу (если не FORCE=1).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Tux0096/monitor.git}"
BRANCH="${BRANCH:-main}"
SRC="${SRC:-/opt/monitor/src}"
APP="${APP:-/opt/monitor}"
PM2_APP="${PM2_APP:-monitor}"

PORT="$(grep '^MONITOR_PORT=' "${APP}/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d ' ')"
PORT="${PORT:-3080}"

if [ ! -d "${SRC}/.git" ]; then
  echo "==> clone ${REPO_URL}"
  rm -rf "${SRC}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${SRC}"
fi

cd "${SRC}"
git fetch --quiet origin "${BRANCH}"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}")"
if [ "${LOCAL}" = "${REMOTE}" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "up_to_date ${LOCAL}"
  exit 0
fi
git reset --hard "origin/${BRANCH}"

cd "${SRC}"
echo "==> npm ci"
npm ci --no-audit --no-fund
echo "==> build"
NODE_OPTIONS="--max-old-space-size=2560" npm run build

if [ ! -f "${APP}/.env.local" ]; then
  echo "ERROR: ${APP}/.env.local missing — configure env on server first"
  exit 1
fi

echo "==> assemble into ${APP}"
chmod -R u+w "${APP}/.next" 2>/dev/null || true
rm -rf "${APP}/.next"
mkdir -p "${APP}/.next"
cp -R .next/standalone "${APP}/.next/standalone"
mkdir -p "${APP}/.next/standalone/.next"
cp -R .next/static "${APP}/.next/standalone/.next/static"
if [ -d public ]; then cp -R public "${APP}/.next/standalone/public"; fi
chmod -R u+w "${APP}/.next" 2>/dev/null || true

cp "${APP}/.env.local" "${APP}/.next/standalone/.env.local"
chmod 600 "${APP}/.next/standalone/.env.local"

mkdir -p "${APP}/scripts"
cp -R scripts/. "${APP}/scripts/"
cp scripts/start-monitor.sh "${APP}/start-monitor.sh"
chmod +x "${APP}/start-monitor.sh"
cp scripts/max-poller.py "${APP}/max-poller.py" 2>/dev/null || true
cp scripts/telegram-poller.sh "${APP}/telegram-poller.sh" 2>/dev/null || true
chmod +x "${APP}/telegram-poller.sh" 2>/dev/null || true

cd "${APP}"
pm2 delete "${PM2_APP}" >/dev/null 2>&1 || true
HOSTNAME=0.0.0.0 PORT="${PORT}" pm2 start start-monitor.sh --name "${PM2_APP}" --interpreter bash --cwd "${APP}" --update-env
if grep -q '^TELEGRAM_BOT_TOKEN=.' "${APP}/.env.local" 2>/dev/null; then
  pm2 delete telegram-poller >/dev/null 2>&1 || true
  pm2 start telegram-poller.sh --name telegram-poller --interpreter bash --cwd "${APP}" --update-env
fi
pm2 save

sed -i 's/\r$//' scripts/server-install-cron.sh 2>/dev/null || true
bash scripts/server-install-cron.sh || echo cron_install_failed

sleep 3
curl -s -o /dev/null -w "monitor_port_${PORT}=%{http_code}\n" "http://127.0.0.1:${PORT}" || true
echo "deployed ${REMOTE}"
