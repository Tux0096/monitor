#!/usr/bin/env bash
set -uo pipefail

MUA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36"
CAPUA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36"

probe() {
  local url="$1"
  local ua="$2"
  local label="$3"
  local tmp="/tmp/probe_$$.html"
  local code size ttfb total ctype
  code=$(curl -sS -o "$tmp" -w '%{http_code}' -A "$ua" --max-time 30 "$url" 2>/dev/null || echo ERR)
  size=$(wc -c < "$tmp" 2>/dev/null | tr -d ' ')
  ttfb=$(curl -sS -o /dev/null -w '%{time_starttransfer}' -A "$ua" --max-time 30 "$url" 2>/dev/null)
  total=$(curl -sS -o /dev/null -w '%{time_total}' -A "$ua" --max-time 30 "$url" 2>/dev/null)
  ctype=$(curl -sS -I -A "$ua" --max-time 15 "$url" 2>/dev/null | grep -i '^content-type:' | head -1 | tr -d '\r')
  title=$(grep -oP '(?<=<title>)[^<]+' "$tmp" 2>/dev/null | head -1)
  echo "[$label] $url"
  echo "  UA: ${ua:0:60}..."
  echo "  HTTP=$code size=${size}B ttfb=${ttfb}s total=${total}s"
  echo "  $ctype"
  echo "  title=${title:-n/a}"
  head -c 200 "$tmp" | tr '\n' ' '
  echo
  echo
}

echo "=== Compare app.fuji.ru vs fuji.ru (mobile) ==="
for u in \
  "https://app.fuji.ru/" \
  "https://app.fuji.ru/catalog" \
  "https://fuji.ru/" \
  "https://fuji.ru/catalog/" \
  "https://fuji.ru/samara/" \
  "https://fuji.ru/samara/catalog/" ; do
  probe "$u" "$MUA" "android-mobile"
done

echo "=== Capacitor-like UA on fuji.ru ==="
probe "https://fuji.ru/" "$CAPUA" "capacitor-ua"
probe "https://fuji.ru/samara/" "$CAPUA" "capacitor-ua-city"

echo "=== Check app.fuji.ru headers / redirects ==="
curl -sS -I -A "$MUA" --max-time 15 "https://app.fuji.ru/" 2>&1 | head -20

echo "=== APK / store hints: well-known paths ==="
for u in \
  "https://fuji.ru/.well-known/assetlinks.json" \
  "https://fuji.ru/manifest.json" \
  "https://fuji.ru/samara/manifest.json" \
  "https://app.fuji.ru/manifest.json" ; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -A "$MUA" --max-time 15 "$u" 2>/dev/null)
  echo "$u -> $code"
done
