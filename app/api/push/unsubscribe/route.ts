import { auth } from "@/auth";
import { proxyPushJson } from "@/lib/push-service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  return proxyPushJson("/push/v1/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
