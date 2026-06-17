import { auth } from "@/auth";
import { mergeAppealsInto } from "@/lib/appeals";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    appealIds?: string[];
  };
  const appealIds = Array.isArray(body.appealIds) ? body.appealIds.map(String) : [];
  if (appealIds.length === 0) {
    return Response.json({ error: "Выберите обращения для объединения" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const appeal = await mergeAppealsInto(id, appealIds);
    if (!appeal) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ appeal });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось объединить" },
      { status: 400 },
    );
  }
}
