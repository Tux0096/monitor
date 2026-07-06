import { appendFile } from "node:fs/promises";

import { handleTelegramSupportMessage } from "@/lib/appeals";
import { saveTelegramPhoto, sendTelegramMessage } from "@/lib/telegram-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id?: number;
  type?: string;
};

type TelegramPhotoSize = {
  file_id?: string;
};

type TelegramMessage = {
  message_id?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

export async function POST(request: Request) {
  const expectedSecret = getRuntimeEnv("TELEGRAM_BOT_WEBHOOK_SECRET");
  const actualSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();

  if (expectedSecret && actualSecret !== expectedSecret) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = body?.message;
  if (!message) {
    return Response.json({ ok: true, skipped: "no_message" });
  }

  await logWebhookEvent({ event: "received", updateId: body?.update_id ?? null });

  const parsed = await parseTelegramMessage(message);
  if (!parsed) {
    return Response.json({ ok: true, skipped: "unparsed_message" });
  }

  const result = await handleTelegramSupportMessage(parsed);

  if (result.reply) {
    try {
      await sendTelegramMessage(parsed.chatId, result.reply);
    } catch (error) {
      await logWebhookEvent({
        chatId: parsed.chatId,
        userId: parsed.userId,
        action: result.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    await logWebhookEvent({
      chatId: parsed.chatId,
      userId: parsed.userId,
      action: result.action,
      text: parsed.text.slice(0, 80),
    });
  }

  return Response.json({ ok: true, action: result.action, appealNumber: result.appealNumber });
}

async function parseTelegramMessage(message: TelegramMessage) {
  const from = message.from;
  const chat = message.chat;
  if (!from?.id || !chat?.id) return null;
  if (from.is_bot) return null;

  const text = (message.text ?? message.caption ?? "").trim();
  let photoUrl: string | null = null;
  const photo = message.photo?.at(-1);
  if (photo?.file_id) {
    photoUrl = await saveTelegramPhoto(photo.file_id);
  }
  if (!text && !photoUrl) return null;

  const senderName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim()
    || from.username?.trim()
    || null;

  return {
    chatId: String(chat.id),
    userId: String(from.id),
    messageId: message.message_id != null ? String(message.message_id) : null,
    senderName,
    senderLastName: from.last_name?.trim() || null,
    text,
    photoUrl,
    isBot: false,
  };
}

async function logWebhookEvent(event: Record<string, unknown>) {
  try {
    const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
    await appendFile("/opt/monitor/telegram-webhook.log", line);
  } catch {
    // ignore logging errors
  }
}
