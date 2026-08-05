#!/usr/bin/env bash
set -uo pipefail
UA="Mozilla/5.0 (Linux; Android 14; ru.fuji.app)"
BASE="https://app.fuji.ru"
mkdir -p /tmp/fuji-js

# download main entry chunks
for js in DGhblgVj.js C0Mkf28y.js Cpo2TnaZ.js DDuTrDuB.js Cu-XMrRI.js BQkc-AXV.js; do
  curl -sS -A "$UA" "${BASE}/_nuxt/${js}" -o "/tmp/fuji-js/${js}" 2>/dev/null || true
done

echo "=== API / host strings in app.fuji.ru bundles ==="
grep -hoE 'https?://[a-zA-Z0-9._/-]+' /tmp/fuji-js/*.js 2>/dev/null | sort -u | head -40

echo "=== fuji/api references ==="
grep -hoE '[a-zA-Z0-9._-]*(fuji|api)[a-zA-Z0-9._/-]*' /tmp/fuji-js/*.js 2>/dev/null | sort -u | head -50

echo "=== baseURL / VITE / NUXT public ==="
grep -hoE '(baseURL|apiUrl|API_URL|VITE_[A-Z_]+|NUXT_PUBLIC_[A-Z_]+)[^,;]{0,80}' /tmp/fuji-js/*.js 2>/dev/null | head -20
