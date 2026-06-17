import { auth } from "@/auth";
import { buildFirebaseBigQueryReport } from "@/lib/firebase-bigquery-report";
import { resolveGoogleApiAuth } from "@/lib/google-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveGoogleApiAuth(session.accessToken);
  if (!resolved.auth) {
    return Response.json(
      {
        error: "Нет доступа к BigQuery API",
        hint:
          "BigQuery export включён, но серверу нужен Google OAuth или service account в /opt/monitor/secrets.",
      },
      { status: 403 },
    );
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || "fuji-notifications";

  try {
    const report = await buildFirebaseBigQueryReport(
      resolved.auth,
      projectId,
      resolved.source,
    );
    return Response.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
