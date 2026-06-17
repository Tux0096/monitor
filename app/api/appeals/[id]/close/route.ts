import { auth } from "@/auth";
import { closeAppeal } from "@/lib/appeals";

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
    resultText?: string;
  };
  const { id } = await params;
  const appeal = await closeAppeal(id, body.resultText?.trim() || "Закрыто");

  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ appeal });
}
