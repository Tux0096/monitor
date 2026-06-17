import { auth } from "@/auth";
import { importSyntheticProbes } from "@/lib/firebase-performance-history";
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
    return Response.json({ ...result, importedAt: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "Не удалось выполнить мониторинг", hint: message }, { status: 500 });
  }
}
