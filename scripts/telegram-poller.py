#!/usr/bin/env python3
"""Long-polling Telegram Bot API → local webhook handler."""
from __future__ import annotations

import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/opt/monitor")
ENV_FILE = ROOT / ".env.local"
OFFSET_FILE = ROOT / "telegram-poll-offset.txt"
LOG_FILE = ROOT / "telegram-poller.log"
TELEGRAM_HOST = "api.telegram.org"


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


def telegram_request(
    token: str,
    method: str,
    *,
    ip: str,
    params: dict[str, str] | None = None,
    body: dict | None = None,
    timeout: int = 65,
    http_method: str = "POST",
) -> dict:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    path = f"/bot{token}/{method}{query}"
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Host": TELEGRAM_HOST}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(payload))

    raw = socket.create_connection((ip, 443), timeout=timeout)
    try:
        ctx = ssl.create_default_context()
        ssl_sock = ctx.wrap_socket(raw, server_hostname=TELEGRAM_HOST)
        request_line = f"{http_method} {path} HTTP/1.1\r\n"
        header_lines = "".join(f"{key}: {value}\r\n" for key, value in headers.items())
        request = f"{request_line}{header_lines}\r\n".encode("utf-8")
        ssl_sock.sendall(request)
        if payload:
            ssl_sock.sendall(payload)

        response = ssl_sock.makefile("rb")
        status_line = response.readline().decode("utf-8", errors="replace")
        if not status_line.startswith("HTTP/"):
            raise RuntimeError(f"invalid response: {status_line[:120]}")
        status = int(status_line.split()[1])

        headers_raw = {}
        while True:
            line = response.readline().decode("utf-8", errors="replace")
            if line in ("\r\n", "\n", ""):
                break
            if ":" in line:
                key, value = line.split(":", 1)
                headers_raw[key.strip().lower()] = value.strip()

        length = int(headers_raw.get("content-length", "0") or "0")
        body_bytes = response.read(length) if length else response.read()
    finally:
        raw.close()

    data = json.loads(body_bytes.decode("utf-8"))
    if status >= 400 or not data.get("ok"):
        raise RuntimeError(f"{method} failed: HTTP {status} {data}")
    return data


def read_offset() -> int:
    if not OFFSET_FILE.exists():
        return 0
    raw = OFFSET_FILE.read_text(encoding="utf-8").strip()
    try:
        return int(raw)
    except ValueError:
        return 0


def write_offset(offset: int) -> None:
    OFFSET_FILE.write_text(str(offset), encoding="utf-8")


def forward_update(update: dict, port: str, secret: str) -> tuple[int, str]:
    url = f"http://127.0.0.1:{port}/api/telegram/webhook"
    request = urllib.request.Request(
        url,
        data=json.dumps(update).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-telegram-bot-api-secret-token": secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body[:200]
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")[:200]


def main() -> int:
    env = load_env(ENV_FILE)
    token = env.get("TELEGRAM_BOT_TOKEN", "")
    secret = env.get("TELEGRAM_BOT_WEBHOOK_SECRET", "")
    port = env.get("MONITOR_PORT", "3080").strip() or "3080"
    ip = env.get("TELEGRAM_API_IP", "149.154.167.220").strip() or "149.154.167.220"

    if not token:
        log("ERROR: TELEGRAM_BOT_TOKEN missing")
        return 1
    if not secret:
        log("ERROR: TELEGRAM_BOT_WEBHOOK_SECRET missing")
        return 1

    try:
        telegram_request(
            token,
            "deleteWebhook",
            ip=ip,
            body={"drop_pending_updates": False},
            timeout=20,
        )
        log("deleteWebhook ok")
    except Exception as error:  # noqa: BLE001
        log(f"deleteWebhook warning: {error}")

    offset = read_offset()
    log(f"poller started offset={offset} ip={ip}")

    while True:
        try:
            payload = telegram_request(
                token,
                "getUpdates",
                ip=ip,
                params={
                    "timeout": "25",
                    "offset": str(offset),
                    "allowed_updates": json.dumps(["message"]),
                },
                timeout=70,
                http_method="GET",
            )
            updates = payload.get("result") or []
            if updates:
                log(f"updates={len(updates)}")
                for update in updates:
                    update_id = int(update.get("update_id", 0))
                    status, body = forward_update(update, port, secret)
                    log(f"forward update_id={update_id} -> HTTP {status} {body}")
                    if update_id >= offset:
                        offset = update_id + 1
                        write_offset(offset)
        except Exception as error:  # noqa: BLE001
            log(f"poll error: {error}")

        time.sleep(1)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
