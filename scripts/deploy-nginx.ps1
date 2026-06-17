# Updates ONLY it.franchise-fuji.ru nginx — never courier.franchise-fuji.ru
param(
  [string]$EnvFile = "$PSScriptRoot/deploy.env"
)

$ErrorActionPreference = "Stop"
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

$Conf = Join-Path $PSScriptRoot "nginx/it.franchise-fuji.ru.conf"
$Remote = "${SERVER_USER}@${SERVER_HOST}"

& scp -o StrictHostKeyChecking=accept-new -i $KeyPath $Conf "${Remote}:/tmp/it.franchise-fuji.ru.conf"
& ssh -o StrictHostKeyChecking=accept-new -i $KeyPath $Remote @"
set -e
sudo mv /tmp/it.franchise-fuji.ru.conf /etc/nginx/sites-available/it.franchise-fuji.ru
sudo ln -sf /etc/nginx/sites-available/it.franchise-fuji.ru /etc/nginx/sites-enabled/it.franchise-fuji.ru
sudo nginx -t
sudo systemctl reload nginx
echo nginx OK
"@

Write-Host "Nginx updated for it.franchise-fuji.ru only"
