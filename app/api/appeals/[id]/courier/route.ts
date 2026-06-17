import { auth } from "@/auth";
import { getAppeal, updateCourierProfile } from "@/lib/appeals";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const appeal = await getAppeal(id);
  if (!appeal?.maxUserId) {
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
  };

  const profile = await updateCourierProfile(appeal.maxUserId, {
    displayName: emptyToNull(body.displayName),
    lastName: emptyToNull(body.lastName),
    phone: emptyToNull(body.phone),
    phoneModel: emptyToNull(body.phoneModel),
    os: emptyToNull(body.os),
    appVersion: emptyToNull(body.appVersion),
    notes: emptyToNull(body.notes),
    tags: body.tags?.filter(Boolean),
  });

  return Response.json({ profile });
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}
