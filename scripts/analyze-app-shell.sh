#!/usr/bin/env bash
set -uo pipefail
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36"

curl -sS -A "$UA" https://app.fuji.ru/ -o /tmp/app-shell.html
echo "=== app.fuji.ru shell size ==="
wc -c /tmp/app-shell.html

echo "=== URLs in shell ==="
grep -oE 'https?://[a-zA-Z0-9._/-]+' /tmp/app-shell.html | sort -u

echo "=== script/module refs ==="
grep -oE '/_nuxt/[^"'\'' ]+' /tmp/app-shell.html | head -10

echo "=== inline config (window.__NUXT__) ==="
grep -o '__NUXT__[^<]*' /tmp/app-shell.html | head -c 2000
echo

echo "=== probe fuji.ru mobile vs app.fuji full download time ==="
for u in "https://fuji.ru/samara/" "https://fuji.ru/samara/catalog/" "https://app.fuji.ru/" "https://app.fuji.ru/catalog"; do
  out=$(curl -sS -o /dev/null -w 'size=%{size_download} ttfb=%{time_starttransfer}s total=%{time_total}s' -A "$UA" --max-time 60 "$u")
  echo "$u -> $out"
done

echo "=== try common API paths on fuji.ru ==="
for p in \
  "/api/" \
  "/api/v1/" \
  "/api/catalog" \
  "/api/menu" \
  "/bitrix/" \
  "/local/api/" ; do
  code=$(curl -sS -o /dev/null -w '%{http_code} %{size_download}' -A "$UA" --max-time 15 "https://fuji.ru${p}")
  echo "https://fuji.ru${p} -> $code"
done
