import { auth } from "@/auth";
import { closeCourierStatWeek } from "@/lib/courier-stat-weeks";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const week = await closeCourierStatWeek({
      id,
      actor: session.user.email ?? "unknown",
    });
    return Response.json({ week });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось закрыть неделю" },
      { status: 400 },
    );
  }
}
