import { auth } from "@/auth";
import { readPerformanceHistoryReport } from "@/lib/firebase-performance-history";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;

  try {
    const report = await readPerformanceHistoryReport(from, to);
    return Response.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error: "Не удалось прочитать историю Firebase Performance",
        hint: message,
      },
      { status: 500 },
    );
  }
}
