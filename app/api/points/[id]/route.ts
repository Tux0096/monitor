import { auth } from "@/auth";
import { updateDeliveryPoint } from "@/lib/points";

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
    name?: string;
    city?: string;
    notes?: string;
    isActive?: boolean;
  };

  const { id } = await params;
  try {
    const point = await updateDeliveryPoint(id, body);
    if (!point) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ point });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}
