import { getRuntimeEnv } from "@/lib/runtime-env";
import { proxyPushJson } from "@/lib/push-service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cronSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret = request.headers.get("x-monitor-import-secret")?.trim();
  if (!cronSecret || requestSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return proxyPushJson("/push/v1/alerts/check-slow-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}
