import { ALLOWED_METRICS, METRIC_TARGETS, type RumMetric } from "./config.js";
import { sql } from "./db/client.js";

export type RumMetricSummary = {
  metric: RumMetric;
  unit: "ms" | "score";
  p50: number | null;
  p75: number | null;
  p95: number | null;
  samples: number;
  good: number;
  poor: number;
  /** good | needs-improvement | poor — по значению p75, как у Core Web Vitals. */
  status: "good" | "needs-improvement" | "poor" | "no-data";
};

export type RumReport = {
  from: string;
  to: string;
  filters: { source: string | null; platform: string | null };
  summary: RumMetricSummary[];
  byPathGroup: Array<{
    pathGroup: string;
    metric: RumMetric;
    p75: number | null;
    samples: number;
  }>;
  timeline: Array<{
    hour: string;
    metric: RumMetric;
    p75: number | null;
    samples: number;
  }>;
  platforms: Array<{ platform: string; source: string; samples: number }>;
};

function statusFor(metric: RumMetric, p75: number | null): RumMetricSummary["status"] {
  if (p75 == null) return "no-data";
  const target = METRIC_TARGETS[metric];
  if (p75 <= target.good) return "good";
  if (p75 <= target.poor) return "needs-improvement";
  return "poor";
}

function resolveRange(from?: string, to?: string) {
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date();
  const start =
    from && !Number.isNaN(Date.parse(from))
      ? new Date(from)
      : new Date(end.getTime() - 7 * 86_400_000);
  // В запросы передаём ISO-строки с явным приведением ::timestamptz.
  // postgres.js не всегда выводит тип для Date внутри выражений с OR/IS NULL
  // и падает на этапе Bind.
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function readRumReport(input: {
  from?: string;
  to?: string;
  source?: string | null;
  platform?: string | null;
}): Promise<RumReport> {
  const { start, end, startIso, endIso } = resolveRange(input.from, input.to);
  const source = input.source || null;
  const platform = input.platform || null;

  // Сводка по метрикам за период.
  //
  // Перцентиль часовых перцентилей — не то же самое, что перцентиль по сырым
  // данным, но за неимением сырых событий старше срока хранения это
  // корректное приближение: взвешиваем по числу замеров в часе.
  const summaryRows = (await sql`
    SELECT
      metric,
      sum(p50 * samples) / NULLIF(sum(samples), 0) AS p50,
      sum(p75 * samples) / NULLIF(sum(samples), 0) AS p75,
      sum(p95 * samples) / NULLIF(sum(samples), 0) AS p95,
      sum(samples)::int AS samples
    FROM rum_rollup_hourly
    WHERE hour >= ${startIso}::timestamptz AND hour <= ${endIso}::timestamptz
      AND (${source}::text IS NULL OR source = ${source}::text)
      AND (${platform}::text IS NULL OR platform = ${platform}::text)
    GROUP BY metric
  `) as Array<{
    metric: RumMetric;
    p50: number | null;
    p75: number | null;
    p95: number | null;
    samples: number;
  }>;

  const summary: RumMetricSummary[] = ALLOWED_METRICS.map((metric) => {
    const row = summaryRows.find((candidate) => candidate.metric === metric);
    const target = METRIC_TARGETS[metric];
    return {
      metric,
      unit: target.unit,
      p50: row?.p50 ?? null,
      p75: row?.p75 ?? null,
      p95: row?.p95 ?? null,
      samples: row?.samples ?? 0,
      good: target.good,
      poor: target.poor,
      status: statusFor(metric, row?.p75 ?? null),
    };
  });

  const byPathGroup = (await sql`
    SELECT
      path_group AS "pathGroup",
      metric,
      sum(p75 * samples) / NULLIF(sum(samples), 0) AS p75,
      sum(samples)::int AS samples
    FROM rum_rollup_hourly
    WHERE hour >= ${startIso}::timestamptz AND hour <= ${endIso}::timestamptz
      AND (${source}::text IS NULL OR source = ${source}::text)
      AND (${platform}::text IS NULL OR platform = ${platform}::text)
    GROUP BY path_group, metric
    HAVING sum(samples) >= 20
    ORDER BY sum(samples) DESC
    LIMIT 100
  `) as RumReport["byPathGroup"];

  const timeline = (await sql`
    SELECT
      hour::text,
      metric,
      sum(p75 * samples) / NULLIF(sum(samples), 0) AS p75,
      sum(samples)::int AS samples
    FROM rum_rollup_hourly
    WHERE hour >= ${startIso}::timestamptz AND hour <= ${endIso}::timestamptz
      AND (${source}::text IS NULL OR source = ${source}::text)
      AND (${platform}::text IS NULL OR platform = ${platform}::text)
    GROUP BY hour, metric
    ORDER BY hour ASC
  `) as RumReport["timeline"];

  const platforms = (await sql`
    SELECT platform, source, sum(samples)::int AS samples
    FROM rum_rollup_hourly
    WHERE hour >= ${startIso}::timestamptz AND hour <= ${endIso}::timestamptz
    GROUP BY platform, source
    ORDER BY samples DESC
  `) as RumReport["platforms"];

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    filters: { source, platform },
    summary,
    byPathGroup,
    timeline,
    platforms,
  };
}

/** Диагностика: идут ли вообще данные и с каких платформ. */
export async function readIngestHealth(): Promise<{
  last5min: number;
  lastHour: number;
  last24h: number;
  lastEventAt: string | null;
  bySource: Array<{ source: string; platform: string; count: number }>;
}> {
  const [totals] = (await sql`
    SELECT
      count(*) FILTER (WHERE received_at > now() - interval '5 minutes')::int AS "last5min",
      count(*) FILTER (WHERE received_at > now() - interval '1 hour')::int AS "lastHour",
      count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS "last24h",
      max(received_at)::text AS "lastEventAt"
    FROM rum_events
  `) as Array<{
    last5min: number;
    lastHour: number;
    last24h: number;
    lastEventAt: string | null;
  }>;

  const bySource = (await sql`
    SELECT source, platform, count(*)::int AS count
    FROM rum_events
    WHERE received_at > now() - interval '24 hours'
    GROUP BY source, platform
    ORDER BY count DESC
  `) as Array<{ source: string; platform: string; count: number }>;

  return {
    last5min: totals?.last5min ?? 0,
    lastHour: totals?.lastHour ?? 0,
    last24h: totals?.last24h ?? 0,
    lastEventAt: totals?.lastEventAt ?? null,
    bySource,
  };
}
