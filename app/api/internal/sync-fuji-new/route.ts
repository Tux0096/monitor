import { runFujiNewSync } from "@/lib/fuji-new-sync";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret = request.headers.get("x-monitor-import-secret")?.trim();
  if (!cronSecret || requestSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFujiNewSync();
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 },
    );
  }
}
