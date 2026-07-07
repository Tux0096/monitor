import { auth } from "@/auth";
import { createManualAppeal, listAppeals } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const appeals = await listAppeals(status, source);
  return Response.json({ appeals });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    incident?: string;
    pointId?: string | null;
    intakeSourceCode?: string;
    initiatorName?: string;
    initiatorLastName?: string;
    phone?: string;
    assignee?: string;
    contractor?: string;
    itComment?: string;
    receivedAt?: string;
  };

  try {
    const appeal = await createManualAppeal({
      incident: body.incident ?? "",
      pointId: body.pointId ?? null,
      intakeSourceCode: body.intakeSourceCode ?? "manual",
      initiatorName: body.initiatorName,
      initiatorLastName: body.initiatorLastName,
      phone: body.phone,
      assignee: body.assignee,
      contractor: body.contractor,
      itComment: body.itComment,
      receivedAt: body.receivedAt,
    });
    return Response.json({ appeal }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось создать обращение" },
      { status: 400 },
    );
  }
}