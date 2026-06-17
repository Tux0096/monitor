import { auth } from "@/auth";
import { createDeliveryPoint, listDeliveryPoints } from "@/lib/points";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const points = await listDeliveryPoints();
  return Response.json({ points });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    city?: string;
    notes?: string;
  };

  try {
    const point = await createDeliveryPoint({
      name: body.name ?? "",
      city: body.city,
      notes: body.notes,
    });
    return Response.json({ point });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось создать точку" },
      { status: 400 },
    );
  }
}
