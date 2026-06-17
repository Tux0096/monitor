import { auth } from "@/auth";
import { readPerformanceHistoryReport } from "@/lib/firebase-performance-history";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await readPerformanceHistoryReport();
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
