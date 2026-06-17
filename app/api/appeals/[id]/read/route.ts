import { auth } from "@/auth";
import { markAppealReadByOperator } from "@/lib/appeals";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const appeal = await markAppealReadByOperator(id);
  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ appeal });
}
