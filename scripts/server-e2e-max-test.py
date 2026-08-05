#!/usr/bin/env python3
import json
import urllib.request
from pathlib import Path

env = {}
for line in Path("/opt/monitor/.env.local").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

update = {
    "message": {
        "recipient": {"chat_id": -73530431297705, "chat_type": "chat"},
        "timestamp": 1781634889033,
        "body": {
            "mid": "mid.test.manual.e2e",
            "text": "не работает приложение",
        },
        "sender": {
            "user_id": 6597525,
            "first_name": "Алексей",
            "is_bot": False,
            "name": "Алексей",
        },
    },
    "timestamp": 1781634889033,
    "update_type": "message_created",
}

req = urllib.request.Request(
    f"http://127.0.0.1:{env.get('MONITOR_PORT','3080')}/api/max/webhook",
    data=json.dumps(update).encode(),
    headers={
        "Content-Type": "application/json",
        "x-max-bot-api-secret": env["MAX_BOT_WEBHOOK_SECRET"],
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=30) as resp:
    print("webhook", resp.status, resp.read().decode())

# test send directly
token = env["MAX_BOT_TOKEN"]
chat_id = "-73530431297705"
url = f"https://platform-api.max.ru/messages?chat_id={chat_id}"
req2 = urllib.request.Request(
    url,
    data=json.dumps({"text": "Тест: бот видит чат и может отвечать."}).encode(),
    headers={"Authorization": token, "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req2, timeout=30) as resp:
        print("send", resp.status, resp.read().decode()[:300])
except Exception as e:
    print("send error", e)
