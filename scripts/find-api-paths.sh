#!/usr/bin/env bash
set -uo pipefail
# extract all /api/ paths from bundles with more context
grep -oE '.{0,30}/api/v[0-9]/[a-zA-Z0-9/_-]+.{0,30}' /tmp/fuji-js2/*.js 2>/dev/null | head -30

echo "=== broader api path search ==="
strings /tmp/fuji-js2/*.js 2>/dev/null | grep -oE '/api/[a-zA-Z0-9/_-]+' | sort -u | head -50

echo "=== probe api-v2 more paths ==="
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app)"
for p in \
  "/api/v1/catalog" \
  "/api/v1/city/list" \
  "/api/v1/city" \
  "/api/v1/menu" \
  "/api/v1/banner" \
  "/api/v1/story" \
  "/api/v1/stories" \
  "/api/v1/promo" \
  "/api/v1/promotions" \
  "/api/v1/restaurants" \
  "/api/v1/brands" \
  "/api/v1/delivery-zones" \
  "/api/v2/catalog" \
  "/api/v2/cities" ; do
  for host in api-v2.fuji.ru api-v3.fuji.ru; do
    out=$(curl -sS -o /dev/null -w '%{http_code} %{size_download} %{time_total}' -A "$UA" -H 'Accept: application/json' --max-time 30 "https://${host}${p}" 2>/dev/null)
    [ "$out" != "404 "* ] && echo "https://${host}${p} -> $out"
  done
done
