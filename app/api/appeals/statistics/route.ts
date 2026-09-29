import { auth } from "@/auth";
import { readAppealsStatistics } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const stats = await readAppealsStatistics({ from, to });
  return Response.json(stats, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
