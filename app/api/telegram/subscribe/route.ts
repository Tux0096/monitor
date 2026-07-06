import { auth } from "@/auth";
import { getTelegramWebhookInfo, setTelegramWebhook } from "@/lib/telegram-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const adminSecret = getRuntimeEnv("TELEGRAM_BOT_ADMIN_SECRET") || getRuntimeEnv("MAX_BOT_ADMIN_SECRET");
  const requestSecret = request.headers.get("x-telegram-admin-secret")?.trim()
    ?? request.headers.get("x-max-admin-secret")?.trim();

  if (!session?.user && (!adminSecret || requestSecret !== adminSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const webhookUrl =
    process.env.TELEGRAM_BOT_WEBHOOK_URL?.trim() || `${origin}/api/telegram/webhook`;
  const webhookSecret = getRuntimeEnv("TELEGRAM_BOT_WEBHOOK_SECRET");

  if (!webhookSecret) {
    return Response.json(
      { error: "TELEGRAM_BOT_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const result = await setTelegramWebhook(webhookUrl, webhookSecret);
  const info = await getTelegramWebhookInfo();
  return Response.json({ webhookUrl, result, info });
}
