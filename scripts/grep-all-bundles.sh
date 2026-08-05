#!/usr/bin/env bash
set -uo pipefail
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app)"
BASE="https://app.fuji.ru"
mkdir -p /tmp/fuji-js2

# fetch shell and all nuxt js refs
curl -sS -A "$UA" "$BASE/" -o /tmp/shell2.html
grep -oE '/_nuxt/[A-Za-z0-9._-]+\.js' /tmp/shell2.html | sort -u > /tmp/jslist.txt
echo "JS files in shell: $(wc -l < /tmp/jslist.txt)"

while read -r path; do
  fn=$(basename "$path")
  curl -sS -A "$UA" "${BASE}${path}" -o "/tmp/fuji-js2/${fn}" 2>/dev/null &
done < /tmp/jslist.txt
wait

echo "=== search fuji/samara/api in all bundles ==="
grep -hoE '[^"'\'' ]*(fuji|samara|tolyatti|api/v[0-9]|/api/)[^"'\'' ]*' /tmp/fuji-js2/*.js 2>/dev/null | sort -u | head -60

echo "=== search https hosts ==="
grep -hoE 'https://[a-zA-Z0-9.-]+\.(ru|com|io)[a-zA-Z0-9./_-]*' /tmp/fuji-js2/*.js 2>/dev/null | sort -u | head -40

# try apk from apkpure metadata page
echo "=== apkpure page hints ==="
curl -sS -A "$UA" "https://apkpure.com/ru/fuji-%D1%84%D1%83%D0%B4%D0%B6%D0%B8/ru.fuji.app" -o /tmp/apk.html 2>/dev/null || true
grep -oiE 'fuji\.ru[^\"<> ]*|app\.fuji[^\"<> ]*|capacitor' /tmp/apk.html 2>/dev/null | sort -u | head -15
