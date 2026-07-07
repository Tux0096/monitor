#!/usr/bin/env python3
from pathlib import Path

p = Path("/opt/monitor/src/lib/appeals.ts")
text = p.read_text(encoding="utf-8")

if "isAllowedTelegramForumTopic" in text:
    print("topic filter already present")
    raise SystemExit(0)

text = text.replace(
    'import { sendTelegramMessage } from "@/lib/telegram-bot";',
    'import { getTelegramForumTopicName, sendTelegramMessage } from "@/lib/telegram-bot";',
)

text = text.replace(
    "  telegramUsername?: string | null;\n};",
    "  telegramUsername?: string | null;\n  isForum?: boolean;\n  messageThreadId?: string | null;\n};",
)

insert_helpers = '''
function getTelegramItTopicNames(): string[] {
  const raw = getRuntimeEnv("TELEGRAM_IT_TOPIC_NAMES") || "IT \\u0437\\u0430\\u044f\\u0432\\u043a\\u0438,it \\u0437\\u0430\\u044f\\u0432\\u043a\\u0438,\\u0430\\u0439\\u0442\\u0438 \\u0437\\u0430\\u044f\\u0432\\u043a\\u0438";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseTelegramItTopicAllowlist(): Array<{ chatId: string | null; threadId: string }> {
  const raw = getRuntimeEnv("TELEGRAM_IT_TOPIC_IDS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) {
        return { chatId: null, threadId: entry };
      }
      return {
        chatId: entry.slice(0, separator).trim(),
        threadId: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.threadId);
}

function isTelegramItTopicName(topicName: string): boolean {
  const normalized = topicName.trim().toLowerCase();
  return getTelegramItTopicNames().some(
    (allowed) => normalized === allowed || normalized.includes(allowed),
  );
}

function isAllowedTelegramTopicById(chatId: string, messageThreadId: string): boolean | null {
  const allowlist = parseTelegramItTopicAllowlist();
  if (allowlist.length === 0) return null;
  return allowlist.some(
    (entry) =>
      entry.threadId === messageThreadId && (entry.chatId == null || entry.chatId === chatId),
  );
}

async function isAllowedTelegramForumTopic(
  chatId: string,
  messageThreadId: string | null | undefined,
): Promise<boolean> {
  if (!messageThreadId) return false;

  const allowedById = isAllowedTelegramTopicById(chatId, messageThreadId);
  if (allowedById === true) return true;
  if (allowedById === false) return false;

  const topicName = await getTelegramForumTopicName(chatId, Number(messageThreadId));
  return Boolean(topicName && isTelegramItTopicName(topicName));
}
'''

text = text.replace(
    "function getAllowedSupportChatIds(): string[] {",
    insert_helpers + "\nfunction getAllowedSupportChatIds(): string[] {",
)

text = text.replace(
    """  const allowedChatIds = getAllowedTelegramChatIds();
  if (allowedChatIds.length > 0 && !allowedChatIds.includes(input.chatId)) {
    return { action: "skipped", reply: null };
  }
  if (!input.userId) return { action: "skipped", reply: null };

  const profileKey = `tg:${input.userId}`;""",
    """  const allowedChatIds = getAllowedTelegramChatIds();
  if (allowedChatIds.length > 0 && !allowedChatIds.includes(input.chatId)) {
    return { action: "skipped", reply: null };
  }
  if (input.isForum) {
    if (!(await isAllowedTelegramForumTopic(input.chatId, input.messageThreadId))) {
      return { action: "skipped", reply: null };
    }
  }
  if (!input.userId) return { action: "skipped", reply: null };

  const profileKey = `tg:${input.userId}`;""",
)

p.write_text(text, encoding="utf-8")
print("topic filter applied")
