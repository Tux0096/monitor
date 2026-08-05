import { auth } from "@/auth";
import { readAppealsStatistics, type AppealsStatisticsChannel } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const channelParam = url.searchParams.get("channel");
  const channel: AppealsStatisticsChannel = channelParam === "courier" ? "courier" : "it";

  const stats = await readAppealsStatistics({ from, to, channel });
  return Response.json(stats, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
