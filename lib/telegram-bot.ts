import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { appealPhotoPublicPath, resolveAppealPhotoFile } from "@/lib/appeal-uploads";
import { getRuntimeEnv } from "@/lib/runtime-env";

const telegramApiBase = "https://api.telegram.org";

function botToken() {
  const token = getRuntimeEnv("TELEGRAM_BOT_TOKEN");
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

function apiUrl(method: string) {
  return `${telegramApiBase}/bot${botToken()}/${method}`;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const response = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${response.status}: ${details}`);
  }
}

export async function setTelegramWebhook(url: string, secretToken: string) {
  const response = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram setWebhook failed: ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export async function getTelegramWebhookInfo() {
  const response = await fetch(apiUrl("getWebhookInfo"));
  if (!response.ok) {
    throw new Error(`Telegram getWebhookInfo failed: ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function saveTelegramPhoto(fileId: string): Promise<string | null> {
  const getFileResponse = await fetch(apiUrl("getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!getFileResponse.ok) return null;

  const getFilePayload = (await getFileResponse.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = getFilePayload.result?.file_path?.trim();
  if (!filePath) return null;

  const fileResponse = await fetch(`${telegramApiBase}/file/bot${botToken()}/${filePath}`);
  if (!fileResponse.ok) return null;

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
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
