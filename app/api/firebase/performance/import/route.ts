import { auth } from "@/auth";
import {
  importMissingFirebasePerformanceDays,
  importMissingPageSpeedDays,
  importSyntheticProbes,
} from "@/lib/firebase-performance-history";
import { resolveGoogleApiAuth } from "@/lib/google-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const cronSecret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  const requestSecret = request.headers.get("x-monitor-import-secret")?.trim();
  const allowedBySecret = Boolean(cronSecret && requestSecret === cronSecret);

  if (!session?.user && !allowedBySecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const yesterday = formatDate(addDays(new Date(), -1));
  const from = url.searchParams.get("from") || yesterday;
  const to = url.searchParams.get("to") || yesterday;
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const projectId =
    getRuntimeEnv("FIREBASE_PROJECT_ID") || "fuji-notifications";

  let probe: unknown = null;
  let probeError: string | null = null;
  try {
    probe = await importSyntheticProbes();
  } catch (e) {
    probeError = e instanceof Error ? e.message : String(e);
  }

  let pageSpeed: unknown = null;
  let pageSpeedError: string | null = null;
  try {
    pageSpeed = await importMissingPageSpeedDays(from, to, force);
  } catch (e) {
    pageSpeedError = e instanceof Error ? e.message : String(e);
  }

  let firebase: unknown = [];
  let firebaseError: string | null = null;
  let firebaseSkipped = false;
  try {
    const resolved = await resolveGoogleApiAuth(session?.accessToken);
    if (resolved.auth) {
      firebase = await importMissingFirebasePerformanceDays(
        resolved.auth,
        projectId,
        from,
        to,
        force,
      );
    } else {
      firebaseSkipped = true;
    }
  } catch (e) {
    firebaseError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({
    projectId,
    from,
    to,
    force,
    probe,
    probeError,
    pageSpeed,
    pageSpeedError,
    firebase,
    firebaseSkipped,
    firebaseError,
    importedAt: new Date().toISOString(),
  });
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
