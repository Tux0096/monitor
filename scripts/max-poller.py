#!/usr/bin/env python3
"""Long-polling MAX Bot API → local webhook handler."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/opt/monitor")
ENV_FILE = ROOT / ".env.local"
MARKER_FILE = ROOT / "max-poll-marker.txt"
LOG_FILE = ROOT / "max-poller.log"
API_BASE = "https://platform-api.max.ru"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\r")
    return values


def log(message: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {message}\n"
    try:
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError:
        pass
    print(message, flush=True)


def http_request(
    method: str,
    url: str,
    token: str,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 35,
) -> tuple[int, str]:
    request_headers = {"Authorization": token}
    if headers:
        request_headers.update(headers)
    data = None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def remove_webhook(token: str, webhook_url: str) -> None:
    encoded = urllib.parse.quote(webhook_url, safe="")
    status, body = http_request(
        "DELETE",
        f"{API_BASE}/subscriptions?url={encoded}",
        token,
        timeout=15,
    )
    log(f"webhook removed status={status} body={body[:200]}")


def read_marker() -> int | None:
    if not MARKER_FILE.exists():
        return None
    raw = MARKER_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def write_marker(marker: int) -> None:
    MARKER_FILE.write_text(str(marker), encoding="utf-8")


def fetch_updates(token: str, marker: int | None, timeout: int = 25) -> dict:
    params = {
        "timeout": str(timeout),
        "limit": "50",
        "types": "message_created,bot_started,message_callback",
    }
    if marker is not None:
        params["marker"] = str(marker)
    url = f"{API_BASE}/updates?{urllib.parse.urlencode(params)}"
    status, body = http_request("GET", url, token, timeout=timeout + 10)
    if status != 200:
        raise RuntimeError(f"updates failed: {status} {body[:300]}")
    return json.loads(body)


def forward_update(update: dict, port: str, secret: str) -> None:
    url = f"http://127.0.0.1:{port}/api/max/webhook"
    status, body = http_request(
        "POST",
        url,
        "",
        body=update,
        headers={"x-max-bot-api-secret": secret},
        timeout=30,
    )
    update_type = update.get("update_type", "?")
    log(f"forwarded {update_type} -> HTTP {status} {body[:200]}")


def bootstrap_marker(token: str) -> int:
    """Position stream at current head without processing old messages."""
    payload = fetch_updates(token, marker=None, timeout=5)
    marker = payload.get("marker")
    if marker is None:
        raise RuntimeError(f"no marker in bootstrap response: {payload}")
    write_marker(int(marker))
    log(f"bootstrap marker={marker}")
    return int(marker)


def main() -> int:
    env = load_env(ENV_FILE)
    token = env.get("MAX_BOT_TOKEN", "")
    secret = env.get("MAX_BOT_WEBHOOK_SECRET", "")
    port = env.get("MONITOR_PORT", "3080").strip() or "3080"
    webhook_url = env.get(
        "MAX_BOT_WEBHOOK_URL",
        "https://it.franchise-fuji.ru/api/max/webhook",
    )

    if not token:
        log("ERROR: MAX_BOT_TOKEN missing")
        return 1

    remove_webhook(token, webhook_url)

    marker = read_marker()
    if marker is None:
        marker = bootstrap_marker(token)

    log(f"poller started marker={marker}")

    while True:
        try:
            payload = fetch_updates(token, marker=marker, timeout=25)
            updates = payload.get("updates") or []
            new_marker = payload.get("marker")

            if updates:
                log(f"updates={len(updates)}")
                for update in updates:
                    forward_update(update, port, secret)

            if new_marker is not None:
                marker = int(new_marker)
                write_marker(marker)

        except Exception as error:  # noqa: BLE001
            log(f"poll error: {error}")

        time.sleep(1)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
