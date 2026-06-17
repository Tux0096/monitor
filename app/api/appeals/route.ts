import { auth } from "@/auth";
import { listAppeals } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const appeals = await listAppeals(status);
  return Response.json({ appeals });
}
