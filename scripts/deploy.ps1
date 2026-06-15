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

$Bundle = Join-Path $ProjectRoot "deploy_bundle.tar.gz"
if (Test-Path $Bundle) { Remove-Item $Bundle -Force }
Write-Host "==> tar bundle"
tar -czf $Bundle .next/standalone .next/static public

$Remote = "${SERVER_USER}@${SERVER_HOST}"
$ScpArgs = @("-o", "StrictHostKeyChecking=accept-new", "-i", $KeyPath, $Bundle, "${Remote}:${REMOTE_DIR}/")
Write-Host "==> scp upload"
& scp @ScpArgs

$RemoteCmd = @"
set -e
cd ${REMOTE_DIR}
tar --overwrite -xzf deploy_bundle.tar.gz
rm -f deploy_bundle.tar.gz
pm2 delete ${PM2_APP_NAME} >/dev/null 2>&1 || true
HOSTNAME=0.0.0.0 PORT=3000 pm2 start .next/standalone/server.js --name ${PM2_APP_NAME} --interpreter node --cwd ${REMOTE_DIR} --update-env
pm2 save
pm2 status
curl -s -o /dev/null -w 'http_local=%{http_code}\n' http://127.0.0.1:3000
curl -s -o /dev/null -w 'nginx_80=%{http_code}\n' http://127.0.0.1
"@

Write-Host "==> ssh restart"
& ssh -o StrictHostKeyChecking=accept-new -i $KeyPath $Remote $RemoteCmd

Write-Host ""
Write-Host "Done: http://${SERVER_HOST}"
