# Deploy docker infra (postgres + auth-service) to /opt/monitor only.
param(
  [string]$EnvFile = "$PSScriptRoot/deploy.env",
  [string]$DockerEnv = "$PSScriptRoot/docker-compose.production"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

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

if (-not (Test-Path $DockerEnv)) {
  Write-Error "Create $DockerEnv from scripts/docker-compose.production.example"
}

$Remote = "${SERVER_USER}@${SERVER_HOST}"
$Archive = Join-Path $ProjectRoot "infra_bundle.tar.gz"

Set-Location $ProjectRoot
if (Test-Path $Archive) { Remove-Item $Archive -Force }
tar -czf $Archive docker-compose.yml infra services/auth-service services/push-notification-service packages/contracts

Write-Host "==> upload infra bundle"
& scp -o StrictHostKeyChecking=accept-new -i $KeyPath $Archive "${Remote}:${REMOTE_DIR}/"
& scp -o StrictHostKeyChecking=accept-new -i $KeyPath $DockerEnv "${Remote}:${REMOTE_DIR}/.env"

$RemoteCmd = @"
set -e
cd ${REMOTE_DIR}
tar -xzf infra_bundle.tar.gz
rm -f infra_bundle.tar.gz
docker compose --env-file .env up -d --build
docker exec monitor-postgres sh -lc "psql -U monitor -d monitor_auth -tc \"SELECT 1 FROM pg_database WHERE datname = 'monitor_core'\" | grep -q 1 || createdb -U monitor monitor_core"
docker compose ps
curl -sf http://127.0.0.1:3101/health | grep -q '"status":"ok"' && echo 'auth OK' || (echo 'auth FAIL' && exit 1)
curl -sf http://127.0.0.1:3103/health | grep -q '"status":"ok"' && echo 'push OK' || (echo 'push FAIL' && exit 1)
"@

Write-Host "==> docker compose up (monitor-net only)"
& ssh -o StrictHostKeyChecking=accept-new -i $KeyPath $Remote $RemoteCmd

Write-Host ""
Write-Host "Infra deployed. Auth: http://127.0.0.1:3101/health"
Write-Host "Does NOT touch /opt/fuji-crm or courier nginx."
