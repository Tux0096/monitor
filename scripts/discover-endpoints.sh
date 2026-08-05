#!/usr/bin/env bash
set -uo pipefail

probe() {
  local url="$1"
  local ua="${2:-Mozilla/5.0}"
  local out
  out=$(curl -sS -o /dev/null -w '%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s type=%{content_type} redirect=%{redirect_url}' \
    --max-time 25 -A "$ua" "$url" 2>&1 || echo "ERR")
  echo "${url} -> ${out}"
}

MUA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"

echo "=== app.fuji.ru (mobile app host) ==="
for u in \
  "https://app.fuji.ru/" \
  "https://app.fuji.ru/catalog" \
  "https://app.fuji.ru/catalog/" \
  "https://app.fuji.ru/search" \
  "https://app.fuji.ru/profile" \
  "https://app.fuji.ru/personal" \
  "https://app.fuji.ru/menu" \
  "https://app.fuji.ru/api/" \
  "https://app.fuji.ru/api/catalog" \
  "https://app.fuji.ru/manifest.json" \
  "https://app.fuji.ru/api/v1/catalog" ; do
  probe "$u" "$MUA"
done

echo "=== city-based site paths ==="
for u in \
  "https://fuji.ru/samara/" \
  "https://fuji.ru/samara/catalog/" \
  "https://fuji.ru/samara/personal/" \
  "https://fuji.ru/samara/cart/" ; do
  probe "$u"
done
