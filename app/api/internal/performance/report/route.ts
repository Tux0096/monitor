import { readPerformanceHistoryReport } from "@/lib/firebase-performance-history";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret = request.headers.get("x-monitor-import-secret")?.trim();
  if (!cronSecret || requestSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await readPerformanceHistoryReport();
    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "report failed" },
      { status: 500 },
    );
  }
}
