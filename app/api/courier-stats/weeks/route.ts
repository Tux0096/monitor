import { auth } from "@/auth";
import {
  createCourierStatWeek,
  listCourierStatWeeks,
} from "@/lib/courier-stat-weeks";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeks = await listCourierStatWeeks();
  return Response.json(
    { weeks },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { weekStart?: string };
  const actor = session.user.email ?? "unknown";

  try {
    const week = await createCourierStatWeek({ weekStart: body.weekStart, actor });
    return Response.json({ week }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось создать неделю" },
      { status: 400 },
    );
  }
}
