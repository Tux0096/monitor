import { auth } from "@/auth";
import { buildFirebaseReport } from "@/lib/firebase-report";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.accessToken) {
    return Response.json(
      {
        error: "Нужен вход через Google",
        hint:
          "Данные Firebase доступны только после авторизации Google с нужными правами в проекте.",
      },
      { status: 403 },
    );
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || "fuji-notifications";

  try {
    const report = await buildFirebaseReport(session.accessToken, projectId);
    return Response.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
