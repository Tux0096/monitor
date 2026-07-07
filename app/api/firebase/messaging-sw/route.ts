import { proxyPushJavaScript } from "@/lib/push-service-client";

export const runtime = "nodejs";

export async function GET() {
  return proxyPushJavaScript("/push/v1/messaging-sw.js");
}
