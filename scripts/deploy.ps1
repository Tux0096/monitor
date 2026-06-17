# Деплой monitor-dashboard на VM (сборка локально + upload standalone)
param(
  [string]$EnvFile = "$PSScriptRoot/deploy.env"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not (Test-Path $EnvFile)) {
  Write-Error "Create $EnvFile from scripts/deploy.env.example"
}

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  Set-Variable -Name $name.Trim() -Value $value.Trim() -Scope Script
}

$KeyPath = if ([System.IO.Path]::IsPathRooted($SSH_KEY_PATH)) {
  $SSH_KEY_PATH
} else {
  (Resolve-Path (Join-Path $PSScriptRoot $SSH_KEY_PATH)).Path
}

if (-not (Test-Path $KeyPath)) {
  Write-Error "SSH key not found: $KeyPath"
}

Set-Location $ProjectRoot
Write-Host "==> npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Remove-Item ".next/standalone/deploy_bundle*.tar.gz" -Force -ErrorAction SilentlyContinue
Remove-Item ".next/standalone/infra_bundle.tar.gz" -Force -ErrorAction SilentlyContinue

$BundleName = "deploy_bundle_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).tar.gz"
$Bundle = Join-Path $ProjectRoot $BundleName
if (Test-Path $Bundle) { Remove-Item $Bundle -Force }
Write-Host "==> tar bundle"
tar -czf $Bundle .next/standalone .next/static public scripts/start-monitor.sh scripts/server-install-cron.sh scripts/server-install-ai.sh scripts/max-poller.py

$Remote = "${SERVER_USER}@${SERVER_HOST}"
$ScpArgs = @("-o", "StrictHostKeyChecking=accept-new", "-i", $KeyPath, $Bundle, "${Remote}:${REMOTE_DIR}/")
Write-Host "==> scp upload"
& scp @ScpArgs

$MonitorPort = if ($MONITOR_PORT) { $MONITOR_PORT } else { "3000" }

$RemoteCmd = @"
set -e
cd ${REMOTE_DIR}
tar --overwrite -xzf ${BundleName}
rm -f ${BundleName}
if [ ! -f .env.local ]; then
  echo "ERROR: /opt/monitor/.env.local not found on server. Configure env only on the server."
  exit 1
fi
cp .env.local .next/standalone/.env.local
chmod 600 .next/standalone/.env.local
set -a
. ./.env.local
set +a
rm -rf .next/standalone/.next/static .next/standalone/public
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
chmod +x scripts/start-monitor.sh
cp scripts/start-monitor.sh start-monitor.sh
pm2 delete ${PM2_APP_NAME} >/dev/null 2>&1 || true
HOSTNAME=0.0.0.0 PORT=${MonitorPort} pm2 start start-monitor.sh --name ${PM2_APP_NAME} --interpreter bash --cwd ${REMOTE_DIR} --update-env
pm2 save
sed -i 's/\r`$//' scripts/server-install-cron.sh
bash scripts/server-install-cron.sh || echo cron_install_failed
sed -i 's/\r`$//' scripts/server-install-ai.sh 2>/dev/null || true
chmod +x scripts/server-install-ai.sh 2>/dev/null || true
bash scripts/server-install-ai.sh || echo ai_install_failed
pm2 status
sleep 3
curl -s -o /dev/null -w 'monitor_port_${MonitorPort}=%{http_code}\n' http://127.0.0.1:${MonitorPort}
curl -sf http://127.0.0.1:${MonitorPort}/api/auth/session >/dev/null && echo auth_session_ok || echo auth_session_FAIL
chmod +x scripts/max-poller.sh scripts/max-poller.py 2>/dev/null || true
cp scripts/max-poller.py max-poller.py 2>/dev/null || true
pm2 delete max-poller >/dev/null 2>&1 || true
MaxToken=`$(grep '^MAX_BOT_TOKEN=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d ' ')
if [ -n "`$MaxToken" ]; then
  pm2 start max-poller.py --name max-poller --interpreter python3 --cwd ${REMOTE_DIR}
  echo max_poller_started
else
  echo max_poller_skipped
fi
"@

Write-Host "==> ssh restart"
& ssh -o StrictHostKeyChecking=accept-new -i $KeyPath $Remote $RemoteCmd

Write-Host "Done: http://${SERVER_HOST}:${MonitorPort}"
Write-Host "Production env is server-only: ${REMOTE_DIR}/.env.local"
Write-Host "Port 80 left to fuji-crm/courier (unchanged)"
