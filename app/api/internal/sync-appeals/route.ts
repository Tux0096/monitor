import { syncAllAppealsData } from "@/lib/appeals-sync";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const adminSecret = getRuntimeEnv("MAX_BOT_ADMIN_SECRET");
  const importSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret =
    request.headers.get("x-max-admin-secret")?.trim() ??
    request.headers.get("x-monitor-import-secret")?.trim();

  if (adminSecret && requestSecret === adminSecret) return true;
  if (importSecret && requestSecret === importSecret) return true;
  return false;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const skipMaxReplay = url.searchParams.get("skipMaxReplay") === "1";
  const skipOrphans = url.searchParams.get("skipOrphans") === "1";

  try {
    const result = await syncAllAppealsData({ dryRun, skipMaxReplay, skipOrphans });
    return Response.json({ ok: true, dryRun, result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
