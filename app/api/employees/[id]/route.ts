import { auth } from "@/auth";
import { getCourierProfile, updateCourierProfile } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const employee = await getCourierProfile(id);
  if (!employee) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ employee, courier: employee });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getCourierProfile(id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    lastName?: string;
    phone?: string;
    phoneModel?: string;
    os?: string;
    appVersion?: string;
    notes?: string;
    tags?: string[];
    pointId?: string | null;
    isAdmin?: boolean;
    telegramAccount?: string;
    maxAccount?: string;
  };

  const employee = await updateCourierProfile(existing.maxUserId, {
    displayName: emptyToNull(body.displayName),
    lastName: emptyToNull(body.lastName),
    phone: emptyToNull(body.phone),
    phoneModel: emptyToNull(body.phoneModel),
    os: emptyToNull(body.os),
    appVersion: emptyToNull(body.appVersion),
    notes: emptyToNull(body.notes),
    tags: body.tags?.filter(Boolean),
    pointId: body.pointId !== undefined ? body.pointId || null : undefined,
    isAdmin: body.isAdmin,
    telegramAccount: body.telegramAccount !== undefined ? emptyToNull(body.telegramAccount) : undefined,
    maxAccount: body.maxAccount !== undefined ? emptyToNull(body.maxAccount) : undefined,
  });

  return Response.json({ employee, courier: employee });
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}
