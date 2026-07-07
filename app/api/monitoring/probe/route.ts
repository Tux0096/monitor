import { auth } from "@/auth";
import {
  importSyntheticProbes,
  readPerformanceHistoryReport,
} from "@/lib/firebase-performance-history";
import { pushServiceFetch } from "@/lib/push-service-client";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await auth();
  const cronSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret = request.headers.get("x-monitor-import-secret")?.trim();
  const allowedBySecret = Boolean(cronSecret && requestSecret === cronSecret);

  if (!session?.user && !allowedBySecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importSyntheticProbes();
    let pushResult: unknown = null;
    try {
      const report = await readPerformanceHistoryReport();
      const pushResponse = await pushServiceFetch("/push/v1/alerts/evaluate-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      pushResult = pushResponse.ok
        ? await pushResponse.json()
        : { skipped: true, status: pushResponse.status };
    } catch {
      pushResult = { skipped: true };
    }
    return Response.json({ ...result, push: pushResult, importedAt: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "Не удалось выполнить мониторинг", hint: message }, { status: 500 });
  }
}
