import { auth } from "@/auth";
import { proxyPushJson } from "@/lib/push-service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  return proxyPushJson("/push/v1/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    userEmail: session.user.email,
  });
}
