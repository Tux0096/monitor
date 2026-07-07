import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import https from "node:https";

import { appealPhotoPublicPath, resolveAppealPhotoFile } from "@/lib/appeal-uploads";
import { getRuntimeEnv } from "@/lib/runtime-env";

const telegramHost = "api.telegram.org";

function botToken() {
  const token = getRuntimeEnv("TELEGRAM_BOT_TOKEN");
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

function telegramApiIp() {
  return getRuntimeEnv("TELEGRAM_API_IP") || telegramHost;
}

function telegramPath(method: string) {
  return `/bot${botToken()}/${method}`;
}

function telegramRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const payload = body ? JSON.stringify(body) : null;
  const ip = telegramApiIp();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: telegramHost,
        path: telegramPath(method),
        method: payload ? "POST" : "GET",
        headers: {
          Host: telegramHost,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw) as T);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function telegramBinaryRequest(path: string): Promise<Buffer> {
  const ip = telegramApiIp();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: telegramHost,
        path,
        method: "GET",
        headers: {
          Host: telegramHost,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Telegram file download failed: ${res.statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const forumTopicNameCache = new Map<string, { name: string; expiresAt: number }>();

export async function getTelegramForumTopicName(
  chatId: string,
  messageThreadId: number,
): Promise<string | null> {
  const cacheKey = `${chatId}:${messageThreadId}`;
  const cached = forumTopicNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.name;
  }

  const result = await telegramRequest<{ ok?: boolean; result?: { name?: string } }>("getForumTopic", {
    chat_id: chatId,
    message_thread_id: messageThreadId,
  });
  const name = result.result?.name?.trim() ?? null;
  if (name) {
    forumTopicNameCache.set(cacheKey, { name, expiresAt: Date.now() + 3_600_000 });
  }
  return name;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { messageThreadId?: string | number | null },
) {
  const threadId = options?.messageThreadId;
  const result = await telegramRequest<{ ok?: boolean; description?: string }>("sendMessage", {
    chat_id: chatId,
    text,
    ...(threadId != null && threadId !== "" ? { message_thread_id: Number(threadId) } : {}),
  });
  if (!result.ok) {
    throw new Error(`Telegram sendMessage failed: ${result.description ?? "unknown error"}`);
  }
}

export async function setTelegramWebhook(url: string, secretToken: string) {
  return telegramRequest("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

export async function getTelegramWebhookInfo() {
  return telegramRequest("getWebhookInfo");
}

export async function saveTelegramPhoto(fileId: string): Promise<string | null> {
  const getFilePayload = await telegramRequest<{
    ok?: boolean;
    result?: { file_path?: string };
  }>("getFile", { file_id: fileId });
  const filePath = getFilePayload.result?.file_path?.trim();
  if (!filePath) return null;

  const buffer = await telegramBinaryRequest(`/file/bot${botToken()}/${filePath}`);
  if (buffer.length < 32 || buffer.length > 8 * 1024 * 1024) return null;

  const extension = filePath.includes(".") ? filePath.split(".").pop()!.toLowerCase() : "jpg";
  const safeExtension = extension.match(/^(jpg|jpeg|png|webp|gif)$/) ? extension : "jpg";
  const fileName = `${randomUUID()}.${safeExtension}`;
  const fullPath = resolveAppealPhotoFile(fileName);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return appealPhotoPublicPath(fileName);
}

export function telegramUserKey(userId: string) {
  return `tg:${userId}`;
}

export function telegramMessageKey(messageId: string) {
  return `tg:${messageId}`;
}

export function telegramConversationKey(chatId: string, userId: string) {
  return `tg:${chatId}:${userId}`;
}
