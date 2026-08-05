#!/usr/bin/env bash
set -a
source /opt/monitor/.env.local
set +a
if [ -n "${PERFORMANCE_IMPORT_SECRET:-}" ]; then
  echo "secret_set_len=${#PERFORMANCE_IMPORT_SECRET}"
else
  echo "secret_missing"
fi
