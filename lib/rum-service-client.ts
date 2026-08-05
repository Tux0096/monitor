import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_RUM_SERVICE_URL = "http://127.0.0.1:3105";

export type RumMetricName = "LCP" | "INP" | "CLS" | "TTFB" | "FCP";

export type RumMetricSummary = {
  metric: RumMetricName;
  unit: "ms" | "score";
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
  good: number;
  poor: number;
  status: "good" | "needs-improvement" | "poor" | "no-data";
};

export type RumReport = {
  from: string;
  to: string;
  filters: { source: string | null; platform: string | null };
  summary: RumMetricSummary[];
  byPathGroup: Array<{
    pathGroup: string;
    metric: RumMetricName;
    p75: number | null;
    samples: number;
  }>;
  timeline: Array<{
    hour: string;
    metric: RumMetricName;
    p75: number | null;
    samples: number;
  }>;
  platforms: Array<{ platform: string; source: string; samples: number }>;
};

export type RumIngestHealth = {
  last5min: number;
  lastHour: number;
  last24h: number;
  lastEventAt: string | null;
  bySource: Array<{ source: string; platform: string; count: number }>;
};

function rumServiceBaseUrl(): string {
  return getRuntimeEnv("RUM_SERVICE_URL")?.trim() || DEFAULT_RUM_SERVICE_URL;
}

async function rumFetch(path: string): Promise<Response> {
  const headers = new Headers();
  const secret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  if (secret) headers.set("x-monitor-import-secret", secret);

  return fetch(`${rumServiceBaseUrl()}${path}`, {
    headers,
    cache: "no-store",
  });
}

/**
 * Ошибки не глушим молча: именно так месяц не замечали, что push-подписки
 * отваливаются с 401. Возвращаем null и пишем причину в лог.
 */
export async function readRumReport(params: {
  from?: string | null;
  to?: string | null;
  source?: string | null;
  platform?: string | null;
}): Promise<RumReport | null> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.source) query.set("source", params.source);
  if (params.platform) query.set("platform", params.platform);

  try {
    const response = await rumFetch(`/rum/v1/report?${query.toString()}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[rum] отчёт недоступен: ${response.status} ${text.slice(0, 200)}`);
      return null;
    }
    return (await response.json()) as RumReport;
  } catch (error) {
    console.error(
      "[rum] сервис недоступен:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function readRumIngestHealth(): Promise<RumIngestHealth | null> {
  try {
    const response = await rumFetch("/rum/v1/health/ingest");
    if (!response.ok) {
      console.error(`[rum] диагностика недоступна: ${response.status}`);
      return null;
    }
    return (await response.json()) as RumIngestHealth;
  } catch (error) {
    console.error(
      "[rum] сервис недоступен:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
