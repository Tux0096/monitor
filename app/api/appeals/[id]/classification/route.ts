import { auth } from "@/auth";
import { updateAppealClassification } from "@/lib/appeals";
import { SUPPORT_CATEGORY_CATALOG, type SupportCategory } from "@/lib/support-classifier";

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
  const body = (await request.json().catch(() => ({}))) as { category?: string };
  const category = body.category?.trim();

  if (!category || !SUPPORT_CATEGORY_CATALOG.some((item) => item.key === category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const appeal = await updateAppealClassification(id, category as SupportCategory);
  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ appeal });
}
