import { appendFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";

import { handleCourierBotMessage, handleSupportGroupMessage } from "@/lib/appeals";
import { sendMaxMessage } from "@/lib/max-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

type MaxWebhookBody = {
  update_type?: string;
  updateType?: string;
  payload?: {
    message?: MaxMessage;
    chat_id?: string | number;
    user_id?: string | number;
    user?: MaxMessage["user"];
  };
  message?: MaxMessage;
};

type MaxAttachment = {
  type?: string;
  payload?: {
    url?: string;
    photo_id?: string | number;
    vcf_info?: string;
    max_info?: {
      phone?: string;
      name?: string;
      first_name?: string;
      last_name?: string;
    };
    hash?: string;
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

  if (updateType === "bot_started") {
    const parsedStart = parseBotStarted(body);
    if (parsedStart) {
      const result = await handleCourierBotMessage({
        chatId: parsedStart.chatId,
        userId: parsedStart.userId,
        messageId: null,
        senderName: parsedStart.senderName,
        senderLastName: null,
        text: "открыть",
        photoUrl: null,
      });
      if (result.reply) {
        const welcome =
          "Добро пожаловать! Нажмите «Открыть» — там личный кабинет и форма обращения с фото.";
        await sendMaxMessage(parsedStart.chatId, welcome, result.keyboard);
      }
      return Response.json({ ok: true, action: result.action });
    }
    return Response.json({ ok: true, skipped: "unparsed_bot_started" });
  }

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

  const handler = parsed.isDialog ? handleCourierBotMessage : handleSupportGroupMessage;
  const result = await handler({
    chatId: parsed.chatId,
    userId: parsed.userId,
    messageId: parsed.messageId,
    senderName: parsed.senderName,
    senderLastName: parsed.senderLastName,
    text: parsed.text,
    photoUrl: parsed.photoUrl,
    contactPhone: parsed.contactPhone,
    contactName: parsed.contactName,
    contactVerified: parsed.contactVerified,
    isBot,
  });

  if (result.reply) {
    try {
      await sendMaxMessage(parsed.chatId, result.reply, result.keyboard);
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
  const contact = extractVerifiedContact(message.body?.attachments);
  if (!text && !photoUrl && !contact?.phone) return null;

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
    contactPhone: contact?.phone ?? null,
    contactName: contact?.name ?? null,
    contactVerified: contact?.verified ?? false,
    isDialog: isDialog(message),
    senderName: formatSenderName(sender),
    senderLastName: formatSenderLastName(sender),
  };
}

function parseBotStarted(body: MaxWebhookBody | null) {
  const payload = body?.payload;
  const chatId = stringifyId(payload?.chat_id ?? body?.message?.chat_id ?? body?.message?.chatId);
  const user = payload?.user ?? body?.message?.sender ?? body?.message?.user;
  const userId = stringifyId(payload?.user_id ?? user?.id);
  if (!chatId || !userId) return null;
  return {
    chatId,
    userId,
    senderName: formatSenderName(user),
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

function extractVerifiedContact(attachments?: MaxAttachment[]) {
  if (!attachments?.length) return null;
  for (const attachment of attachments) {
    if (attachment.type?.toLowerCase() !== "contact") continue;
    const payload = attachment.payload;
    const vcfInfo = normalizeVcf(payload?.vcf_info);
    const phone =
      extractPhoneFromVcf(vcfInfo) ??
      normalizePhone(payload?.max_info?.phone ?? "");
    const name = payload?.max_info?.name ?? extractNameFromVcf(vcfInfo);
    return {
      phone,
      name,
      verified: Boolean(phone && vcfInfo && payload?.hash && verifyContactHash(vcfInfo, payload.hash)),
    };
  }
  return null;
}

function verifyContactHash(vcfInfo: string, expectedHash: string) {
  const token = getRuntimeEnv("MAX_BOT_TOKEN");
  if (!token) return false;
  const keys = [token, token.replace(/^Bearer\s+/i, "")].filter(Boolean);
  return keys.some((key) => {
    const actual = createHmac("sha256", key).update(vcfInfo).digest("hex");
    return safeEqualHex(actual, expectedHash);
  });
}

function safeEqualHex(left: string, right: string) {
  const normalizedRight = right.trim().toLowerCase();
  if (!/^[a-f0-9]+$/i.test(normalizedRight) || left.length !== normalizedRight.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(normalizedRight, "hex"));
}

function normalizeVcf(value?: string) {
  return value?.replaceAll("\\r\\n", "\r\n").replaceAll("\\n", "\n") ?? null;
}

function extractPhoneFromVcf(vcfInfo: string | null) {
  const match = vcfInfo?.match(/TEL[^:]*:([+\d\s().-]+)/i);
  return normalizePhone(match?.[1] ?? "");
}

function extractNameFromVcf(vcfInfo: string | null) {
  return vcfInfo?.match(/FN:([^\r\n]+)/i)?.[1]?.trim() ?? null;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+7${digits}`;
  return value.trim() || null;
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
