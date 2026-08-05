#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MONITOR_ENV_FILE:-/opt/monitor/.env.local}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

log() {
  echo "[install-ai] $*"
}

set_env() {
  local key="$1"
  local value="$2"
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

wait_ollama() {
  for _ in $(seq 1 45); do
    if curl -sf "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

pull_model() {
  local model="$1"
  log "pull ${model}"
  if ! ollama pull "$model"; then
    log "WARN: failed to pull ${model}"
    return 1
  fi
  return 0
}

if ! command -v ollama >/dev/null 2>&1; then
  log "installing ollama"
  curl -fsSL https://ollama.com/install.sh | sh
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable ollama >/dev/null 2>&1 || true
  systemctl restart ollama >/dev/null 2>&1 || systemctl start ollama >/dev/null 2>&1 || true
fi

log "waiting for ollama"
if ! wait_ollama; then
  log "ERROR: ollama API not reachable at http://${OLLAMA_HOST}"
  exit 1
fi

MEM_MB="$(free -m | awk '/Mem:/ {print $2}')"
TEXT_MODEL="qwen2.5:1.5b-instruct"
VISION_MODEL="moondream"
log "memory ${MEM_MB} MB, text=${TEXT_MODEL}, vision=${VISION_MODEL}"

pull_model "$TEXT_MODEL" || {
  TEXT_MODEL="llama3.2:1b"
  pull_model "$TEXT_MODEL" || TEXT_MODEL=""
}
pull_model "$VISION_MODEL" || VISION_MODEL=""

set_env LOCAL_AI_URL "http://${OLLAMA_HOST%:*}:11434"
set_env LOCAL_AI_MODEL "$TEXT_MODEL"
if [ -n "$VISION_MODEL" ]; then
  set_env LOCAL_AI_VISION_MODEL "$VISION_MODEL"
fi

log "env updated in ${ENV_FILE}"
grep -E '^LOCAL_AI_' "$ENV_FILE" || true

log "installed models:"
ollama list || true

if [ -n "$VISION_MODEL" ]; then
  log "vision smoke test"
  if ! command -v convert >/dev/null 2>&1; then
    apt-get update -qq >/dev/null 2>&1 || true
    apt-get install -y -qq imagemagick >/dev/null 2>&1 || true
  fi
  TEST_IMG="/tmp/monitor-ai-smoke.png"
  if command -v convert >/dev/null 2>&1; then
    convert -size 640x360 xc:'#121820' -fill '#ff6666' -draw 'text 40,180 "Error 5: no server connection"' "$TEST_IMG" || true
  fi
  if [ -f "$TEST_IMG" ]; then
    set +e
    VISION_JSON="$(python3 - <<PY
import base64, json, pathlib, urllib.request
img = pathlib.Path("${TEST_IMG}").read_bytes()
payload = {
    "model": "${VISION_MODEL}",
    "prompt": "Опиши проблему на скриншоте курьерского приложения одной фразой на русском.",
    "stream": False,
    "images": [base64.b64encode(img).decode("ascii")],
}
req = urllib.request.Request(
    "http://127.0.0.1:11434/api/generate",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=180) as resp:
    print(resp.read().decode("utf-8"))
PY
)"
    VISION_RC=$?
    set -e
    if [ "$VISION_RC" -eq 0 ]; then
      echo "$VISION_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print('[install-ai] vision reply:', (d.get('response') or '')[:160])" || true
    else
      log "WARN: vision smoke test failed, models remain installed"
    fi
  else
    log "WARN: smoke image not created, skipping vision test"
  fi
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart monitor >/dev/null 2>&1 || true
  log "monitor restarted"
fi

log "done"
