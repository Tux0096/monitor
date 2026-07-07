import { auth } from "@/auth";
import {
  readAppealAnalytics,
  readAppealsAnalyticsReport,
  type AppealsAnalyticsRange,
} from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const sourceParam = url.searchParams.get("source");
  const source =
    sourceParam === "max" || sourceParam === "telegram" ? sourceParam : null;
  const range: AppealsAnalyticsRange = { from, to, source };

  const [rows, report] = await Promise.all([
    readAppealAnalytics(range),
    readAppealsAnalyticsReport(range),
  ]);
  return Response.json({ rows, report, from, to, source });
}
