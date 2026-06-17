#!/usr/bin/env bash
# Авто-деплой по push: каждые 2 минуты тянем git и пересобираем при изменениях.
set -euo pipefail

APP="${APP:-/opt/monitor}"
LINE="*/2 * * * * flock -n /tmp/monitor-deploy.lock bash ${APP}/scripts/server-git-deploy.sh >> ${APP}/deploy.log 2>&1"

TMP=$(mktemp)
crontab -l 2>/dev/null | grep -v 'server-git-deploy.sh' > "${TMP}" || true
echo "${LINE}" >> "${TMP}"
crontab "${TMP}"
rm -f "${TMP}"

echo "deploy_cron_installed"
crontab -l | grep -c 'server-git-deploy.sh'
