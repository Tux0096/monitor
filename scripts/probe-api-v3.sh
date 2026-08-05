#!/usr/bin/env bash
grep -hoE 'https://[a-zA-Z0-9.-]+\.fuji\.ru[^"'\'' ]*|/api/v[0-9]/[a-zA-Z0-9/_-]+' /tmp/fuji-js2/*.js 2>/dev/null | sort -u

echo "--- probe api-v2 and api-v3 ---"
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app)"
for url in \
  "https://api-v2.fuji.ru/api/v1/catalog" \
  "https://api-v3.fuji.ru/api/v1/catalog" \
  "https://api-v3.fuji.ru/api/v1/cities" \
  "https://api-v3.fuji.ru/api/v1/categories" \
  "https://api-v3.fuji.ru/api/v1/banners" \
  "https://api-v3.fuji.ru/api/v1/stories" \
  "https://api-v3.fuji.ru/api/v1/settings" \
  "https://api-v3.fuji.ru/api/v1/products" \
  "https://fuji-web-api-v3.fuji.ru/api/v1/catalog" ; do
  out=$(curl -sS -o /dev/null -w 'HTTP=%{http_code} size=%{size_download} ttfb=%{time_starttransfer}s total=%{time_total}s' -A "$UA" -H 'Accept: application/json' --max-time 60 "$url" 2>/dev/null)
  echo "$url -> $out"
done

echo "--- app shell + JS total load (simulated) ---"
shell=$(curl -sS -o /dev/null -w '%{time_total}' -A "$UA" https://app.fuji.ru/)
js1=$(curl -sS -o /dev/null -w '%{time_total}' -A "$UA" https://app.fuji.ru/_nuxt/DGhblgVj.js)
api=$(curl -sS -o /dev/null -w '%{time_total}' -A "$UA" -H 'Accept: application/json' https://api-v3.fuji.ru/api/v1/catalog)
echo "shell=${shell}s main_js=${js1}s catalog_api=${api}s"
