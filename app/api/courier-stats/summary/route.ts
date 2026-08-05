import { auth } from "@/auth";
import { readCourierStatSummary } from "@/lib/courier-stat-weeks";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await readCourierStatSummary();
  return Response.json(
    { summary },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
