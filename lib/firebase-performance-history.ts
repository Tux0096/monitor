import { google } from "googleapis";
import postgres from "postgres";
import type { ResolvedGoogleAuth } from "@/lib/google-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

const pageSpeedApp = "pagespeed";
const firebaseWebVitalMetrics = [
  "domContentLoadedEventEnd",
  "firstContentfulPaint",
  "largestContentfulPaint",
  "firstInputDelay",
] as const;

const pageSpeedAudits: Array<{ id: string; metricName: string }> = [
  { id: "first-contentful-paint", metricName: "First Contentful Paint" },
  { id: "largest-contentful-paint", metricName: "Largest Contentful Paint" },
  { id: "speed-index", metricName: "Speed Index" },
  { id: "total-blocking-time", metricName: "Total Blocking Time" },
  { id: "interactive", metricName: "Time to Interactive" },
  { id: "dom-content-loaded", metricName: "DOM Content Loaded" },
  { id: "server-response-time", metricName: "Server Response Time" },
  { id: "first-meaningful-paint", metricName: "First Meaningful Paint" },
  { id: "max-potential-fid", metricName: "Max Potential FID" },
  { id: "experimental-interaction-to-next-paint", metricName: "Interaction to Next Paint" },
];

type PageSpeedResponse = {
  lighthouseResult?: {
    categories?: {
      performance?: {
        score?: number;
      };
    };
    audits?: Record<
      string,
      {
        numericValue?: number;
      }
    >;
  };
};

type GoogleAuthClient = ResolvedGoogleAuth["auth"];

export type StoredPerformanceMetric = {
  metricName: string;
  sourceType: "site" | "mobile";
  app: string;
  page: string;
  day: string;
  avgMs: number | null;
  samples: number;
};

export type HistoryChartPoint = {
  dayIndex: number;
  label: string;
  valueMs: number | null;
};

export type WeeklyMetricSummary = {
  label: string;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
};

export type HistoryPageMetric = {
  metricName: string;
  app: string;
  page: string;
  sourceType: "site" | "mobile";
  currentMs: number | null;
  previousMs: number | null;
  deltaPercent: number | null;
  samples: number;
  chart: HistoryChartPoint[];
  weekly: WeeklyMetricSummary[];
};

export type PerformanceHistoryReport = {
  metricName: string;
  pages: HistoryPageMetric[];
  fetchedAt: string;
};

let sqlClient: postgres.Sql | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    throw new Error("MONITOR_DATABASE_URL is not configured");
  }
  sqlClient ??= postgres(url, { max: 5 });
  return sqlClient;
}

export async function ensurePerformanceHistorySchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS firebase_performance_daily (
      metric_name text NOT NULL,
      source_type text NOT NULL,
      app text NOT NULL,
      page text NOT NULL,
      day date NOT NULL,
      avg_ms double precision,
      samples integer NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (metric_name, app, page, day)
    )
  `;
}

export async function importFirebasePerformanceDay(
  auth: GoogleAuthClient,
  projectId: string,
  day: string,
) {
  await ensurePerformanceHistorySchema();
  const rows = await queryFirebasePerformanceDay(auth, projectId, day);
  await insertPerformanceRows(rows);

  return { day, insertedOrExisting: rows.length };
}

export async function importMissingFirebasePerformanceDays(
  auth: GoogleAuthClient,
  projectId: string,
  from: string,
  to: string,
  force = false,
) {
  await ensurePerformanceHistorySchema();
  const days = enumerateClosedDays(from, to);
  const imported: Array<{ day: string; insertedOrExisting: number; error?: string }> = [];

  for (const day of days) {
    if (!force) {
      const exists = await sql()`
        SELECT 1
        FROM firebase_performance_daily
        WHERE source_type = 'mobile'
          AND day = ${day}
        LIMIT 1
      `;
      if (exists.length > 0) {
        imported.push({ day, insertedOrExisting: 0 });
        continue;
      }
    }
    imported.push(await importFirebasePerformanceDay(auth, projectId, day));
  }

  return imported;
}

export async function importPageSpeedDay(day: string) {
  await ensurePerformanceHistorySchema();
  const rows = await queryPageSpeedDay(day);
  await insertPerformanceRows(rows);
  return { day, insertedOrExisting: rows.length };
}

export async function importMissingPageSpeedDays(from: string, to: string, force = false) {
  await ensurePerformanceHistorySchema();
  const days = enumerateClosedDays(from, to);
  const imported: Array<{ day: string; insertedOrExisting: number; error?: string }> = [];

  for (const day of days) {
    if (!force) {
      const exists = await sql()`
        SELECT 1
        FROM firebase_performance_daily
        WHERE source_type = 'site'
          AND day = ${day}
        LIMIT 1
      `;
      if (exists.length > 0) {
        imported.push({ day, insertedOrExisting: 0 });
        continue;
      }
    }
    try {
      imported.push(await importPageSpeedDay(day));
    } catch (error) {
      imported.push({
        day,
        insertedOrExisting: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return imported;
}

export async function readPerformanceHistoryReport(): Promise<PerformanceHistoryReport> {
  await ensurePerformanceHistorySchema();
  const rows = (await sql()`
    SELECT
      metric_name AS "metricName",
      source_type AS "sourceType",
      app,
      page,
      day::text,
      avg_ms AS "avgMs",
      samples
    FROM firebase_performance_daily
    WHERE day >= CURRENT_DATE - INTERVAL '30 days'
      AND day <= CURRENT_DATE
    ORDER BY day ASC
  `) as StoredPerformanceMetric[];

  return {
    metricName: "Performance",
    pages: buildPageMetrics(rows),
    fetchedAt: new Date().toISOString(),
  };
}

async function queryFirebasePerformanceDay(
  auth: GoogleAuthClient,
  projectId: string,
  day: string,
): Promise<StoredPerformanceMetric[]> {
  const bq = google.bigquery({ version: "v2", auth });
  const performanceTables = await listTables(bq, projectId, "firebase_performance");
  if (performanceTables.length === 0) return [];

  const webVitals = await queryFirebaseWebVitalsDay(bq, projectId, performanceTables, day);
  const traces = await queryFirebaseTracesDay(bq, projectId, performanceTables, day);
  return [...webVitals, ...traces];
}

async function queryFirebaseWebVitalsDay(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  performanceTables: Array<{ datasetId: string; tableId: string }>,
  day: string,
): Promise<StoredPerformanceMetric[]> {
  const metricList = firebaseWebVitalMetrics.map((metric) => `'${escapeSqlString(metric)}'`).join(", ");
  const query = `
    WITH base AS (${unionPerformanceTables(projectId, performanceTables)}),
    filtered AS (
      SELECT
        app,
        event_name AS metric_name,
        COALESCE(
          REGEXP_EXTRACT(raw_json, r'"page_url"\\s*:\\s*"([^"]+)"'),
          REGEXP_EXTRACT(raw_json, r'"pageUrl"\\s*:\\s*"([^"]+)"'),
          REGEXP_EXTRACT(raw_json, r'"page_path"\\s*:\\s*"([^"]+)"'),
          REGEXP_EXTRACT(raw_json, r'"url"\\s*:\\s*"([^"]+)"'),
          app
        ) AS page,
        duration_ms
      FROM base
      WHERE DATE(event_timestamp) = DATE('${escapeSqlString(day)}')
        AND event_name IN (${metricList})
        AND duration_ms IS NOT NULL
    )
    SELECT
      metric_name AS metricName,
      'mobile' AS sourceType,
      app,
      page,
      '${escapeSqlString(day)}' AS day,
      AVG(duration_ms) AS avgMs,
      COUNT(*) AS samples
    FROM filtered
    GROUP BY metric_name, app, page
    ORDER BY samples DESC
  `;

  const res = await bq.jobs.query({
    projectId,
    requestBody: {
      query,
      useLegacySql: false,
      location: getRuntimeEnv("BIGQUERY_LOCATION") || "US",
    },
  });

  return mapBigQueryRows(res);
}

async function queryFirebaseTracesDay(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  performanceTables: Array<{ datasetId: string; tableId: string }>,
  day: string,
): Promise<StoredPerformanceMetric[]> {
  const query = `
    WITH base AS (${unionPerformanceTables(projectId, performanceTables)}),
    filtered AS (
      SELECT
        app,
        event_name,
        event_type,
        duration_ms
      FROM base
      WHERE DATE(event_timestamp) = DATE('${escapeSqlString(day)}')
        AND event_type IN ('DURATION_TRACE', 'SCREEN_TRACE')
        AND duration_ms IS NOT NULL
    )
    SELECT
      CONCAT(event_type, ':', event_name) AS metricName,
      'mobile' AS sourceType,
      app,
      event_name AS page,
      '${escapeSqlString(day)}' AS day,
      AVG(duration_ms) AS avgMs,
      COUNT(*) AS samples
    FROM filtered
    GROUP BY event_type, event_name, app
    ORDER BY samples DESC
    LIMIT 40
  `;

  const res = await bq.jobs.query({
    projectId,
    requestBody: {
      query,
      useLegacySql: false,
      location: getRuntimeEnv("BIGQUERY_LOCATION") || "US",
    },
  });

  return mapBigQueryRows(res);
}

async function queryPageSpeedDay(day: string): Promise<StoredPerformanceMetric[]> {
  const siteUrl = getRuntimeEnv("PAGESPEED_SITE_URL") || "https://fuji.ru/";
  const strategies = ["mobile", "desktop"] as const;
  const rows: StoredPerformanceMetric[] = [];

  for (const strategy of strategies) {
    const data = await fetchPageSpeedReport(siteUrl, strategy);
    const audits = data.lighthouseResult?.audits ?? {};
    const performanceScore = data.lighthouseResult?.categories?.performance?.score;

    for (const audit of pageSpeedAudits) {
      const metric = readPageSpeedAudit(audits, audit.id, audit.metricName);
      if (!metric) continue;
      rows.push({
        metricName: metric.metricName,
        sourceType: "site",
        app: `${pageSpeedApp}:${strategy}`,
        page: `${siteUrl} · ${strategy === "mobile" ? "моб." : "ПК"}`,
        day,
        avgMs: metric.avgMs,
        samples: 1,
      });
    }

    if (typeof performanceScore === "number") {
      rows.push({
        metricName: "Performance Score",
        sourceType: "site",
        app: `${pageSpeedApp}:${strategy}`,
        page: `${siteUrl} · ${strategy === "mobile" ? "моб." : "ПК"}`,
        day,
        avgMs: Math.round(performanceScore * 100),
        samples: 1,
      });
    }
  }

  return rows;
}

async function fetchPageSpeedReport(siteUrl: string, strategy: "mobile" | "desktop") {
  const apiKey = getRuntimeEnv("PAGESPEED_API_KEY");
  const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", siteUrl);
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("category", "performance");
  if (apiKey) url.searchParams.set("key", apiKey);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`PageSpeed API ${response.status} (${strategy}): ${await response.text()}`);
  }

  return (await response.json()) as PageSpeedResponse;
}

// --- Синтетический HTTP-мониторинг (не требует Google) ---------------------
// Замеряет реальное время отклика страниц сайта и мобильного приложения.
// Работает всегда, даже без PageSpeed/Firebase, и пишет в ту же таблицу.

type ProbeTarget = { name: string; url: string };

const PROBE_SAMPLES = 3;
const PROBE_TIMEOUT_MS = 30_000;
const PROBE_UA_SITE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 FujiMonitor/1.0";
const PROBE_UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FujiMonitor/1.0";

const DEFAULT_SITE_PROBE_TARGETS: ProbeTarget[] = [
  { name: "Стартовая страница", url: "https://fuji.ru/" },
  { name: "Каталог", url: "https://fuji.ru/catalog/" },
  { name: "Личный кабинет", url: "https://fuji.ru/personal/" },
  { name: "Корзина", url: "https://fuji.ru/cart/" },
];

const DEFAULT_MOBILE_PROBE_TARGETS: ProbeTarget[] = [
  { name: "Запуск приложения", url: "https://app.fuji.ru/" },
  { name: "Каталог", url: "https://app.fuji.ru/catalog" },
  { name: "Поиск", url: "https://app.fuji.ru/search" },
  { name: "Профиль", url: "https://app.fuji.ru/profile" },
];

function parseProbeTargets(envKey: string, fallback: ProbeTarget[]): ProbeTarget[] {
  const raw = getRuntimeEnv(envKey);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const targets = parsed
      .map((item) => {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const url = typeof obj.url === "string" ? obj.url.trim() : "";
          const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : url;
          if (url) return { name, url };
        }
        return null;
      })
      .filter((item): item is ProbeTarget => Boolean(item));
    return targets.length > 0 ? targets : fallback;
  } catch {
    return fallback;
  }
}

type ProbeSample = { ttfbMs: number; totalMs: number; ok: boolean; status: number };

async function probeOnce(url: string, userAgent: string): Promise<ProbeSample> {
  const start = performance.now();
  const response = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: { "user-agent": userAgent, accept: "*/*" },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const ttfbMs = performance.now() - start;
  await response.arrayBuffer();
  const totalMs = performance.now() - start;
  return { ttfbMs, totalMs, ok: response.ok || (response.status >= 300 && response.status < 400), status: response.status };
}

async function probeTarget(
  target: ProbeTarget,
  userAgent: string,
): Promise<{ ttfbMs: number | null; totalMs: number | null; samples: number; lastStatus: number }> {
  const ttfb: number[] = [];
  const total: number[] = [];
  let lastStatus = 0;
  for (let i = 0; i < PROBE_SAMPLES; i += 1) {
    try {
      const sample = await probeOnce(target.url, userAgent);
      lastStatus = sample.status;
      if (sample.ok) {
        ttfb.push(sample.ttfbMs);
        total.push(sample.totalMs);
      }
    } catch {
      // недоступность учитываем уменьшением числа удачных сэмплов
    }
  }
  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { ttfbMs: avg(ttfb), totalMs: avg(total), samples: total.length, lastStatus };
}

async function upsertProbeRow(row: StoredPerformanceMetric) {
  await sql()`
    INSERT INTO firebase_performance_daily (
      metric_name, source_type, app, page, day, avg_ms, samples
    )
    VALUES (
      ${row.metricName}, ${row.sourceType}, ${row.app}, ${row.page},
      ${row.day}, ${row.avgMs}, ${row.samples}
    )
    ON CONFLICT (metric_name, app, page, day) DO UPDATE
    SET avg_ms = CASE
          WHEN ${row.avgMs}::double precision IS NULL THEN firebase_performance_daily.avg_ms
          WHEN firebase_performance_daily.avg_ms IS NULL THEN ${row.avgMs}
          ELSE (
            firebase_performance_daily.avg_ms * firebase_performance_daily.samples
              + ${row.avgMs}::double precision * ${row.samples}::integer
          ) / NULLIF(firebase_performance_daily.samples + ${row.samples}::integer, 0)
        END,
        samples = firebase_performance_daily.samples + ${row.samples}::integer,
        imported_at = now()
  `;
}

export async function importSyntheticProbes(): Promise<{
  day: string;
  site: number;
  mobile: number;
  details: Array<{ group: string; name: string; totalMs: number | null; samples: number; status: number }>;
}> {
  await ensurePerformanceHistorySchema();
  const day = toDateString(startOfUtcDay(new Date()));
  const siteTargets = parseProbeTargets("SITE_PROBE_TARGETS", DEFAULT_SITE_PROBE_TARGETS);
  const mobileTargets = parseProbeTargets("MOBILE_PROBE_TARGETS", DEFAULT_MOBILE_PROBE_TARGETS);
  const details: Array<{
    group: string;
    name: string;
    totalMs: number | null;
    samples: number;
    status: number;
  }> = [];

  const runGroup = async (
    targets: ProbeTarget[],
    sourceType: "site" | "mobile",
    app: string,
    userAgent: string,
  ) => {
    let stored = 0;
    for (const target of targets) {
      const result = await probeTarget(target, userAgent);
      details.push({
        group: sourceType,
        name: target.name,
        totalMs: result.totalMs,
        samples: result.samples,
        status: result.lastStatus,
      });
      if (result.samples === 0) continue;
      await upsertProbeRow({
        metricName: target.name,
        sourceType,
        app,
        page: target.url,
        day,
        avgMs: result.totalMs,
        samples: result.samples,
      });
      await upsertProbeRow({
        metricName: `${target.name} · ответ сервера`,
        sourceType,
        app,
        page: target.url,
        day,
        avgMs: result.ttfbMs,
        samples: result.samples,
      });
      stored += 1;
    }
    return stored;
  };

  const site = await runGroup(siteTargets, "site", "probe:site", PROBE_UA_SITE);
  const mobile = await runGroup(mobileTargets, "mobile", "probe:app", PROBE_UA_MOBILE);

  return { day, site, mobile, details };
}

function mapBigQueryRows(res: { data: { rows?: Array<{ f?: Array<{ v?: unknown }> }> | null; schema?: { fields?: Array<{ name?: string | null }> | null } | null } }) {
  return ((res.data.rows ?? []).map((row) =>
    Object.fromEntries(
      (res.data.schema?.fields ?? []).map((field, idx) => [
        field.name ?? `field_${idx}`,
        parseBigQueryValue(row.f?.[idx]?.v),
      ]),
    ),
  ) ?? []) as StoredPerformanceMetric[];
}

async function insertPerformanceRows(rows: StoredPerformanceMetric[]) {
  for (const row of rows) {
    await sql()`
      INSERT INTO firebase_performance_daily (
        metric_name,
        source_type,
        app,
        page,
        day,
        avg_ms,
        samples
      )
      VALUES (
        ${row.metricName},
        ${row.sourceType},
        ${row.app},
        ${row.page},
        ${row.day},
        ${row.avgMs},
        ${row.samples}
      )
      ON CONFLICT (metric_name, app, page, day) DO UPDATE
      SET avg_ms = EXCLUDED.avg_ms,
          samples = EXCLUDED.samples,
          imported_at = now()
    `;
  }
}

async function listTables(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  datasetId: string,
) {
  const res = await bq.tables.list({ projectId, datasetId });
  return (res.data.tables ?? [])
    .map((table) => table.tableReference?.tableId)
    .filter((tableId): tableId is string => Boolean(tableId))
    .filter((tableId) => !tableId.endsWith("_REALTIME"))
    .map((tableId) => ({ datasetId, tableId }));
}

function unionPerformanceTables(
  projectId: string,
  tables: Array<{ datasetId: string; tableId: string }>,
): string {
  return tables
    .map(
      (table) => `
        SELECT
          '${escapeSqlString(table.tableId)}' AS app,
          event_timestamp,
          event_name,
          trace_info.duration_us / 1000 AS duration_ms,
          TO_JSON_STRING(t) AS raw_json
        FROM \`${escapeIdentifier(projectId)}.${escapeIdentifier(table.datasetId)}.${escapeIdentifier(table.tableId)}\` AS t
      `,
    )
    .join("\nUNION ALL\n");
}

function buildPageMetrics(rows: StoredPerformanceMetric[]): HistoryPageMetric[] {
  const today = startOfUtcDay(new Date());
  const currentStart = addDays(today, -30);
  const previousStart = addDays(today, -60);
  const pageKeys = Array.from(
    new Set(rows.map((row) => `${row.metricName}:${row.app}:${row.page}`)),
  );

  return pageKeys
    .map((key) => {
      const pageRows = rows.filter(
        (row) => `${row.metricName}:${row.app}:${row.page}` === key,
      );
      const currentRows = pageRows.filter((row) => {
        const day = new Date(row.day);
        return day >= currentStart && day <= today;
      });
      const previousRows = pageRows.filter((row) => {
        const day = new Date(row.day);
        return day >= previousStart && day < currentStart;
      });
      const currentMs = weightedAverage(currentRows);
      const previousMs = weightedAverage(previousRows);
      const first = pageRows[0];

      return {
        metricName: first.metricName,
        app: first.app,
        page: first.page,
        sourceType: first.sourceType,
        currentMs,
        previousMs,
        deltaPercent:
          currentMs == null || previousMs == null || previousMs === 0
            ? null
            : ((currentMs - previousMs) / previousMs) * 100,
        samples: currentRows.reduce((sum, row) => sum + row.samples, 0),
        chart: buildChart(pageRows),
        weekly: buildWeeklySummary(pageRows),
      };
    })
    .filter((row) => row.currentMs != null)
    .sort((a, b) => (b.currentMs ?? 0) - (a.currentMs ?? 0))
    .slice(0, 24);
}

function buildChart(rows: StoredPerformanceMetric[]): HistoryChartPoint[] {
  const today = startOfUtcDay(new Date());
  const currentStart = addDays(today, -29);

  return Array.from({ length: 30 }, (_, dayIndex) => {
    const currentDay = addDays(currentStart, dayIndex);
    return {
      dayIndex,
      label: currentDay.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      valueMs: weightedAverage(rows.filter((row) => sameDay(row.day, currentDay))),
    };
  });
}

function buildWeeklySummary(rows: StoredPerformanceMetric[]): WeeklyMetricSummary[] {
  const today = startOfUtcDay(new Date());
  const start = addDays(today, -30);

  return Array.from({ length: 5 }, (_, weekIndex) => {
    const weekStart = addDays(start, weekIndex * 7);
    const weekEnd = weekIndex === 4 ? addDays(today, 1) : addDays(weekStart, 7);
    const weekRows = rows.filter((row) => {
      const day = new Date(row.day);
      return day >= weekStart && day < weekEnd;
    });
    const values = weekRows
      .map((row) => row.avgMs)
      .filter((value): value is number => value != null);

    return {
      label: `${weekStart.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      })} - ${addDays(weekEnd, -1).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      })}`,
      avgMs: weightedAverage(weekRows),
      minMs: values.length > 0 ? Math.min(...values) : null,
      maxMs: values.length > 0 ? Math.max(...values) : null,
    };
  });
}

function enumerateClosedDays(from: string, to: string): string[] {
  const start = startOfUtcDay(new Date(from));
  const end = startOfUtcDay(new Date(to));
  const today = startOfUtcDay(new Date());
  const days: string[] = [];

  for (let day = start; day <= end && day < today; day = addDays(day, 1)) {
    days.push(toDateString(day));
  }

  return days;
}

function weightedAverage(rows: StoredPerformanceMetric[]): number | null {
  const totalSamples = rows.reduce((sum, row) => sum + row.samples, 0);
  if (totalSamples === 0) return null;
  const total = rows.reduce(
    (sum, row) => sum + (row.avgMs ?? 0) * row.samples,
    0,
  );
  return total / totalSamples;
}

function readPageSpeedAudit(
  audits: NonNullable<PageSpeedResponse["lighthouseResult"]>["audits"],
  id: string,
  metricName: string,
): { metricName: string; avgMs: number } | null {
  const value = audits?.[id]?.numericValue;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return { metricName, avgMs: value };
}

function sameDay(value: string, date: Date): boolean {
  return toDateString(new Date(value)) === toDateString(date);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseBigQueryValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

function escapeIdentifier(value: string): string {
  return value.replaceAll("`", "");
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "\\'");
}
