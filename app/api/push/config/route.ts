import { proxyPushJson } from "@/lib/push-service-client";

export const runtime = "nodejs";

export async function GET() {
  return proxyPushJson("/push/v1/config");
}
