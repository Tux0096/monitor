#!/usr/bin/env bash
set -uo pipefail
cd /opt/monitor
set -a
# shellcheck disable=SC1091
source .env.local
set +a

echo "=== ENV value lengths ==="
for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN GOOGLE_OAUTH_TOKEN_FILE GOOGLE_SERVICE_ACCOUNT_FILE FIREBASE_PROJECT_ID BIGQUERY_LOCATION PAGESPEED_SITE_URL PAGESPEED_STRATEGY PAGESPEED_API_KEY GOOGLE_SHEET_ID; do
  v="$(grep "^${k}=" .env.local 2>/dev/null | cut -d= -f2- | tr -d '\r')"
  echo "${k} len=${#v}"
done

echo "=== OAuth token file ==="
TF="$(grep '^GOOGLE_OAUTH_TOKEN_FILE=' .env.local | cut -d= -f2- | tr -d '\r')"
echo "path=${TF}"
ls -la "${TF}" 2>&1 || true

echo "=== DB row counts (firebase_performance_daily) ==="
PGURL="$(grep '^MONITOR_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\r')"
if command -v psql >/dev/null 2>&1; then
  psql "${PGURL}" -t -c "SELECT source_type, count(*), min(day), max(day) FROM firebase_performance_daily GROUP BY source_type;" 2>&1 || true
else
  echo "psql not installed; trying via node history endpoint"
fi

echo "=== PageSpeed direct test (no key, mobile) ==="
SITE="$(grep '^PAGESPEED_SITE_URL=' .env.local | cut -d= -f2- | tr -d '\r')"
SITE="${SITE:-https://fuji.ru/}"
code=$(curl -sS -o /tmp/ps.json -w '%{http_code}' "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$SITE")&strategy=mobile&category=performance")
echo "HTTP ${code}"
head -c 400 /tmp/ps.json
echo

echo "=== Direct HTTP probe of fuji.ru pages ==="
for path in "/" "/catalog/" "/search/" "/personal/"; do
  url="https://fuji.ru${path}"
  out=$(curl -sS -o /dev/null -w '%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s' --max-time 30 "$url" 2>&1 || echo "ERR")
  echo "${url} -> ${out}"
done
