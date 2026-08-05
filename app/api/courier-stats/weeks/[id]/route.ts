import { auth } from "@/auth";
import {
  getCourierStatWeek,
  setCourierStatWeekOrders,
} from "@/lib/courier-stat-weeks";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const week = await getCourierStatWeek(id);
  if (!week) {
    return Response.json({ error: "Неделя не найдена" }, { status: 404 });
  }
  return Response.json({ week });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { ordersTotal?: unknown };

  const ordersTotal = Number(body.ordersTotal);
  if (!Number.isInteger(ordersTotal) || ordersTotal < 0) {
    return Response.json(
      { error: "ordersTotal должно быть целым неотрицательным числом" },
      { status: 400 },
    );
  }

  try {
    const week = await setCourierStatWeekOrders({
      id,
      ordersTotal,
      actor: session.user.email ?? "unknown",
    });
    return Response.json({ week });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}
