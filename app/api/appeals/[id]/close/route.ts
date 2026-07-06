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
  const resultText = body.resultText?.trim();
  if (!resultText) {
    return Response.json({ error: "Укажите решение для закрытия обращения" }, { status: 400 });
  }
  const appeal = await closeAppeal(id, resultText);

  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ appeal });
}
