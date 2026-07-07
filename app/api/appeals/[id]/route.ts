import { auth } from "@/auth";
import { updateAppealByOperator, type AppealStatus } from "@/lib/appeals";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    issueText?: string;
    resultText?: string;
    operatorReply?: string;
    status?: AppealStatus;
    pointId?: string | null;
    intakeSourceCode?: string | null;
    inProgressAt?: string | null;
    resolutionMethod?: "remote" | "onsite" | null;
    assignee?: string | null;
    contractor?: string | null;
    itComment?: string | null;
  };

  const { id } = await params;
  try {
    const appeal = await updateAppealByOperator(id, body);
    if (!appeal) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ appeal });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}
