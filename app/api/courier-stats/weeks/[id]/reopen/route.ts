import { auth } from "@/auth";
import { reopenCourierStatWeek } from "@/lib/courier-stat-weeks";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Переоткрытие меняет уже сданную отчётность — только админ.
  if (session.user.role !== "admin") {
    return Response.json(
      { error: "Переоткрыть закрытую неделю может только администратор" },
      { status: 403 },
    );
  }

  const { id } = await context.params;

  try {
    const week = await reopenCourierStatWeek({
      id,
      actor: session.user.email ?? "unknown",
    });
    return Response.json({ week });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось переоткрыть" },
      { status: 400 },
    );
  }
}
