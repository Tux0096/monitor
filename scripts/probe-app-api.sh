#!/usr/bin/env bash
set -uo pipefail
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app) AppleWebKit/537.36"
CAP="application/json"

probe() {
  local url="$1"
  local method="${2:-GET}"
  local tmp="/tmp/api_$$.json"
  local code size ttfb total
  code=$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" -A "$UA" -H "Accept: $CAP" --max-time 30 "$url" 2>/dev/null || echo ERR)
  size=$(wc -c < "$tmp" 2>/dev/null | tr -d ' ')
  ttfb=$(curl -sS -o /dev/null -w '%{time_starttransfer}' -X "$method" -A "$UA" -H "Accept: $CAP" --max-time 30 "$url" 2>/dev/null)
  total=$(curl -sS -o /dev/null -w '%{time_total}' -X "$method" -A "$UA" -H "Accept: $CAP" --max-time 30 "$url" 2>/dev/null)
  preview=$(head -c 120 "$tmp" | tr '\n' ' ')
  echo "$url [$method] -> HTTP=$code size=${size}B ttfb=${ttfb}s total=${total}s"
  echo "  $preview"
  echo
}

echo "=== fuji-app-api-v1.fuji.ru ==="
for p in \
  "/" \
  "/api/" \
  "/api/v1/" \
  "/api/v1/catalog" \
  "/api/v1/menu" \
  "/api/v1/cities" \
  "/api/v1/city" \
  "/api/v1/products" \
  "/api/v1/categories" \
  "/api/v1/banners" \
  "/api/v1/stories" \
  "/api/v1/profile" \
  "/api/v1/user" \
  "/api/v1/orders" \
  "/api/v1/settings" \
  "/api/v1/delivery" \
  "/health" \
  "/swagger" ; do
  probe "https://fuji-app-api-v1.fuji.ru${p}"
done

echo "=== api-v3.fuji.ru sample ==="
for p in "/" "/api/v1/catalog" "/api/v3/catalog" "/catalog"; do
  probe "https://api-v3.fuji.ru${p}"
done

echo "=== grep API paths from bundles ==="
grep -hoE '/api/v[0-9]/[a-zA-Z0-9/_-]+' /tmp/fuji-js2/*.js 2>/dev/null | sort -u | head -40
