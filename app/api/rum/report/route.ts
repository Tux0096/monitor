import { auth } from "@/auth";
import { readRumIngestHealth, readRumReport } from "@/lib/rum-service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const [report, ingest] = await Promise.all([
    readRumReport({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      source: url.searchParams.get("source"),
      platform: url.searchParams.get("platform"),
    }),
    readRumIngestHealth(),
  ]);

  if (!report) {
    return Response.json(
      { error: "Сервис RUM недоступен. Проверьте, что контейнер rum-collector запущен." },
      { status: 503 },
    );
  }

  return Response.json(
    { report, ingest },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
