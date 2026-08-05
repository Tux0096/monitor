import { auth } from "@/auth";
import { closeAppeal } from "@/lib/appeals";
import { SUPPORT_CATEGORY_CATALOG, type SupportCategory } from "@/lib/support-classifier";

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
    category?: string;
  };
  const { id } = await params;
  const resultText = body.resultText?.trim();
  if (!resultText) {
    return Response.json({ error: "Укажите решение для закрытия обращения" }, { status: 400 });
  }

  let category: SupportCategory | undefined;
  if (body.category?.trim()) {
    const key = body.category.trim();
    if (!SUPPORT_CATEGORY_CATALOG.some((item) => item.key === key)) {
      return Response.json({ error: "Invalid category" }, { status: 400 });
    }
    category = key as SupportCategory;
  }

  const appeal = await closeAppeal(id, resultText, category);

  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ appeal });
}
