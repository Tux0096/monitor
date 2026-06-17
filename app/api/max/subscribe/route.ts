import { auth } from "@/auth";
import { subscribeMaxWebhook } from "@/lib/max-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const adminSecret = getRuntimeEnv("MAX_BOT_ADMIN_SECRET");
  const requestSecret = request.headers.get("x-max-admin-secret")?.trim();

  if (!session?.user && (!adminSecret || requestSecret !== adminSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const webhookUrl =
    process.env.MAX_BOT_WEBHOOK_URL?.trim() || `${origin}/api/max/webhook`;
  const webhookSecret = getRuntimeEnv("MAX_BOT_WEBHOOK_SECRET");

  if (!webhookSecret) {
    return Response.json(
      { error: "MAX_BOT_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const result = await subscribeMaxWebhook(webhookUrl, webhookSecret);
  return Response.json({ webhookUrl, result });
}
