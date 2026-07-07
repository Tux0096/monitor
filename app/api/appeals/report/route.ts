import { auth } from "@/auth";
import { listAppealsReport } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const channel = url.searchParams.get("channel") === "courier" ? "courier" : "it";

  const rows = await listAppealsReport({
    from,
    to,
    channel,
  });

  return Response.json({ rows });
}
