import { appendFile } from "node:fs/promises";

import { handleSupportGroupMessage } from "@/lib/appeals";
import { sendMaxMessage } from "@/lib/max-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

type MaxWebhookBody = {
  update_type?: string;
  updateType?: string;
  payload?: {
    message?: MaxMessage;
  };
  message?: MaxMessage;
};

type MaxAttachment = {
  type?: string;
  payload?: {
    url?: string;
    photo_id?: string | number;
  };
};

type MaxMessage = {
  id?: string | number;
  text?: string;
  body?: {
    mid?: string;
    text?: string;
    attachments?: MaxAttachment[];
  };
  recipient?: {
    chat_id?: string | number;
    chatId?: string | number;
    chat_type?: string;
    chatType?: string;
    user_id?: string | number;
    userId?: string | number;
  };
  chat_id?: string | number;
  chatId?: string | number;
  chat?: {
    id?: string | number;
    type?: string;
  };
  sender?: {
    user_id?: string | number;
    userId?: string | number;
    id?: string | number;
    name?: string;
    first_name?: string;
    last_name?: string;
    is_bot?: boolean;
    isBot?: boolean;
  };
  user?: {
    id?: string | number;
    name?: string;
    is_bot?: boolean;
    isBot?: boolean;
  };
};

export async function POST(request: Request) {
  const expectedSecret = getRuntimeEnv("MAX_BOT_WEBHOOK_SECRET");
  const actualSecret = request.headers.get("x-max-bot-api-secret")?.trim();

  if (expectedSecret && actualSecret !== expectedSecret) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as MaxWebhookBody | null;
  const updateType = body?.update_type ?? body?.updateType;

  await logWebhookEvent({ event: "received", updateType: updateType ?? "unknown" });
  const message = body?.payload?.message ?? body?.message;

  if (updateType && updateType !== "message_created") {
    return Response.json({ ok: true });
  }

  const parsed = parseMaxMessage(message);
  if (!parsed) {
    return Response.json({ ok: true, skipped: "unparsed_message" });
  }

  const botUserId = getRuntimeEnv("MAX_BOT_USER_ID");
  const isBot =
    Boolean(message?.sender?.is_bot ?? message?.sender?.isBot) ||
    Boolean(message?.user?.is_bot ?? message?.user?.isBot) ||
    (botUserId != null && parsed.userId === botUserId);

  const result = await handleSupportGroupMessage({
    chatId: parsed.chatId,
    userId: parsed.userId,
    messageId: parsed.messageId,
    senderName: parsed.senderName,
    senderLastName: parsed.senderLastName,
    text: parsed.text,
    photoUrl: parsed.photoUrl,
    isBot,
  });

  if (result.reply) {
    try {
      await sendMaxMessage(parsed.chatId, result.reply);
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

async function logWebhookEvent(event: Record<string, unknown>) {
  try {
    const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
    await appendFile("/opt/monitor/max-webhook.log", line);
  } catch {
    // ignore logging errors
  }
}

function parseMaxMessage(message?: MaxMessage) {
  if (!message) return null;

  const text = (message.body?.text ?? message.text ?? "").trim();
  const photoUrl = extractPhotoUrl(message.body?.attachments);
  if (!text && !photoUrl) return null;

  const chatId = stringifyId(
    message.recipient?.chat_id ??
      message.recipient?.chatId ??
      message.chat_id ??
      message.chatId ??
      message.chat?.id ??
      (isDialog(message) ? message.recipient?.user_id ?? message.recipient?.userId : null),
  );
  if (!chatId) return null;

  const messageId = stringifyId(message.body?.mid ?? message.id);
  const sender = message.sender ?? message.user;
  const userId = stringifyId(
    message.sender?.user_id ??
      message.sender?.userId ??
      message.sender?.id ??
      message.user?.id,
  );

  return {
    chatId,
    messageId,
    userId,
    text,
    photoUrl,
    senderName: formatSenderName(sender),
    senderLastName: formatSenderLastName(sender),
  };
}

function extractPhotoUrl(attachments?: MaxAttachment[]) {
  if (!attachments?.length) return null;
  for (const attachment of attachments) {
    const type = attachment.type?.toLowerCase();
    if (type === "image" || type === "photo" || type === "file") {
      const url = attachment.payload?.url?.trim();
      if (url) return url;
    }
  }
  return null;
}

function isDialog(message: MaxMessage) {
  const chatType = message.recipient?.chat_type ?? message.recipient?.chatType;
  return chatType === "dialog";
}

function formatSenderName(sender?: MaxMessage["sender"] | MaxMessage["user"]): string | null {
  if (!sender) return null;
  const named = sender as MaxMessage["sender"];
  const fullName = [named?.first_name, named?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return sender.name?.trim() || fullName || null;
}

function formatSenderLastName(sender?: MaxMessage["sender"] | MaxMessage["user"]): string | null {
  const named = sender as MaxMessage["sender"] | undefined;
  return named?.last_name?.trim() || null;
}

function stringifyId(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}
