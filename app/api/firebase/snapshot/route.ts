import { auth } from "@/auth";
import { buildFirebaseReport } from "@/lib/firebase-report";
import { resolveGoogleApiAuth } from "@/lib/google-auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveGoogleApiAuth(session.accessToken);
  if (!resolved.auth) {
    return Response.json(
      {
        error: "Нет доступа к Firebase API",
        hint:
          "Подключите Google Firebase OAuth в дашборде. Refresh token хранится только на сервере.",
      },
      { status: 403 },
    );
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || "fuji-notifications";

  try {
    const report = await buildFirebaseReport(
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
