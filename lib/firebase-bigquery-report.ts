import { google } from "googleapis";
import type { ResolvedGoogleAuth } from "@/lib/google-auth";

type GoogleAuthClient = ResolvedGoogleAuth["auth"];

export type FirebaseBigQueryTable = {
  datasetId: string;
  tableId: string;
};

export type PerformanceMetricRow = {
  app: string;
  type: string;
  name: string;
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  avgMs: number | null;
};

export type NetworkMetricRow = {
  app: string;
  url: string;
  samples: number;
  p95Ms: number | null;
  avgMs: number | null;
  successRate: number | null;
};

export type CrashMetricRow = {
  app: string;
  events: number;
  fatalEvents: number | null;
  latestEventAt: string | null;
};

export type WebVitalChartPoint = {
  dayIndex: number;
  label: string;
  currentMs: number | null;
  previousMs: number | null;
};

export type WebVitalPageMetric = {
  app: string;
  page: string;
  currentMs: number | null;
  previousMs: number | null;
  deltaPercent: number | null;
  samples: number;
  chart: WebVitalChartPoint[];
};

type WebVitalPageChartRow = WebVitalChartPoint & {
  app: string;
  page: string;
};

export type WebVitalMetricReport = {
  metricName: string;
  scope: string;
  currentMs: number | null;
  previousMs: number | null;
  deltaPercent: number | null;
  chart: WebVitalChartPoint[];
  pages: WebVitalPageMetric[];
};

export type FirebaseBigQueryReport = {
  projectId: string;
  authSource: ResolvedGoogleAuth["source"] | "none";
  datasets: {
    performance: boolean;
    crashlytics: boolean;
  };
  tables: {
    performance: FirebaseBigQueryTable[];
    crashlytics: FirebaseBigQueryTable[];
  };
  performance: {
    traces: PerformanceMetricRow[];
    screens: PerformanceMetricRow[];
    network: NetworkMetricRow[];
    webVitals: {
      domContentLoadedEventEnd: WebVitalMetricReport | null;
    };
  };
  crashlytics: {
    summary: CrashMetricRow[];
  };
  warnings: string[];
  fetchedAt: string;
};

export async function buildFirebaseBigQueryReport(
  auth: GoogleAuthClient,
  projectId: string,
  authSource: ResolvedGoogleAuth["source"],
): Promise<FirebaseBigQueryReport> {
  const bq = google.bigquery({ version: "v2", auth });
  const warnings: string[] = [];

  const performanceTables = await listTables(
    bq,
    projectId,
    "firebase_performance",
    warnings,
  );
  const crashlyticsTables = await listTables(
    bq,
    projectId,
    "firebase_crashlytics",
    warnings,
  );

  const [traces, screens, network, webVital, crashSummary] = await Promise.all([
    queryPerformanceTraces(bq, projectId, performanceTables, warnings),
    queryScreenPerformance(bq, projectId, performanceTables, warnings),
    queryNetworkPerformance(bq, projectId, performanceTables, warnings),
    queryWebVitalMetric(
      bq,
      projectId,
      performanceTables,
      warnings,
      "domContentLoadedEventEnd",
    ),
    queryCrashSummary(bq, projectId, crashlyticsTables, warnings),
  ]);

  return {
    projectId,
    authSource,
    datasets: {
      performance: performanceTables.length > 0,
      crashlytics: crashlyticsTables.length > 0,
    },
    tables: {
      performance: performanceTables,
      crashlytics: crashlyticsTables,
    },
    performance: {
      traces,
      screens,
      network,
      webVitals: {
        domContentLoadedEventEnd: webVital,
      },
    },
    crashlytics: {
      summary: crashSummary,
    },
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}

async function listTables(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  datasetId: string,
  warnings: string[],
): Promise<FirebaseBigQueryTable[]> {
  try {
    const res = await bq.tables.list({ projectId, datasetId });
    return (res.data.tables ?? [])
      .map((table) => table.tableReference?.tableId)
      .filter((tableId): tableId is string => Boolean(tableId))
      .filter((tableId) => !tableId.endsWith("_REALTIME"))
      .map((tableId) => ({ datasetId, tableId }));
  } catch (e) {
    warnings.push(`${datasetId}: ${formatError(e)}`);
    return [];
  }
}

async function queryPerformanceTraces(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  tables: FirebaseBigQueryTable[],
  warnings: string[],
): Promise<PerformanceMetricRow[]> {
  if (tables.length === 0) return [];
  const sql = `
    SELECT
      app,
      event_type AS type,
      event_name AS name,
      COUNT(*) AS samples,
      APPROX_QUANTILES(trace_info.duration_us / 1000, 100)[OFFSET(50)] AS p50Ms,
      APPROX_QUANTILES(trace_info.duration_us / 1000, 100)[OFFSET(95)] AS p95Ms,
      AVG(trace_info.duration_us / 1000) AS avgMs
    FROM (${unionPerformanceTables(projectId, tables)})
    WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      AND event_type = 'DURATION_TRACE'
      AND trace_info.duration_us IS NOT NULL
    GROUP BY app, type, name
    ORDER BY p95Ms DESC
    LIMIT 20
  `;
  return queryRows<PerformanceMetricRow>(bq, projectId, sql, warnings, "Performance traces");
}

async function queryScreenPerformance(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  tables: FirebaseBigQueryTable[],
  warnings: string[],
): Promise<PerformanceMetricRow[]> {
  if (tables.length === 0) return [];
  const sql = `
    SELECT
      app,
      event_type AS type,
      event_name AS name,
      COUNT(*) AS samples,
      ROUND(AVG(trace_info.screen_info.slow_frame_ratio) * 100, 2) AS p50Ms,
      ROUND(MAX(trace_info.screen_info.frozen_frame_ratio) * 100, 2) AS p95Ms,
      ROUND(AVG(trace_info.screen_info.frozen_frame_ratio) * 100, 2) AS avgMs
    FROM (${unionPerformanceTables(projectId, tables)})
    WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      AND event_type = 'SCREEN_TRACE'
    GROUP BY app, type, name
    ORDER BY p50Ms DESC
    LIMIT 20
  `;
  return queryRows<PerformanceMetricRow>(bq, projectId, sql, warnings, "Screen performance");
}

async function queryNetworkPerformance(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  tables: FirebaseBigQueryTable[],
  warnings: string[],
): Promise<NetworkMetricRow[]> {
  if (tables.length === 0) return [];
  const sql = `
    SELECT
      app,
      event_name AS url,
      COUNT(*) AS samples,
      APPROX_QUANTILES(network_info.response_time_us / 1000, 100)[OFFSET(95)] AS p95Ms,
      AVG(network_info.response_time_us / 1000) AS avgMs,
      ROUND(AVG(IF(network_info.http_response_code BETWEEN 200 AND 399, 1, 0)) * 100, 2) AS successRate
    FROM (${unionPerformanceTables(projectId, tables)})
    WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      AND event_type = 'NETWORK_REQUEST'
      AND network_info.response_time_us IS NOT NULL
    GROUP BY app, url
    ORDER BY p95Ms DESC
    LIMIT 20
  `;
  return queryRows<NetworkMetricRow>(bq, projectId, sql, warnings, "Network performance");
}

async function queryWebVitalMetric(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  tables: FirebaseBigQueryTable[],
  warnings: string[],
  metricName: string,
): Promise<WebVitalMetricReport | null> {
  if (tables.length === 0) return null;

  const metric = escapeSqlString(metricName);
  const base = webVitalBaseSql(projectId, tables);
  const dailySql = `
    WITH base AS (${base}),
    filtered AS (
      SELECT
        event_timestamp,
        page,
        duration_ms,
        IF(
          event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY),
          'current',
          'previous'
        ) AS period,
        IF(
          event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY),
          DATE_DIFF(DATE(event_timestamp), DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)), DAY),
          DATE_DIFF(DATE(event_timestamp), DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)), DAY)
        ) AS day_index
      FROM base
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
        AND event_name = '${metric}'
        AND duration_ms IS NOT NULL
    )
    SELECT
      day_index AS dayIndex,
      FORMAT_DATE('%b %d', DATE_ADD(DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)), INTERVAL day_index DAY)) AS label,
      AVG(IF(period = 'current', duration_ms, NULL)) AS currentMs,
      AVG(IF(period = 'previous', duration_ms, NULL)) AS previousMs
    FROM filtered
    WHERE day_index BETWEEN 0 AND 6
    GROUP BY dayIndex, label
    ORDER BY dayIndex
  `;

  const pageSql = `
    WITH base AS (${base}),
    filtered AS (
      SELECT
        app,
        page,
        duration_ms,
        event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AS is_current
      FROM base
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
        AND event_name = '${metric}'
        AND duration_ms IS NOT NULL
    )
    SELECT
      app,
      page,
      AVG(IF(is_current, duration_ms, NULL)) AS currentMs,
      AVG(IF(NOT is_current, duration_ms, NULL)) AS previousMs,
      SAFE_MULTIPLY(
        SAFE_DIVIDE(
          AVG(IF(is_current, duration_ms, NULL)) - AVG(IF(NOT is_current, duration_ms, NULL)),
          AVG(IF(NOT is_current, duration_ms, NULL))
        ),
        100
      ) AS deltaPercent,
      COUNTIF(is_current) AS samples
    FROM filtered
    GROUP BY app, page
    HAVING currentMs IS NOT NULL
    ORDER BY ABS(IFNULL(deltaPercent, 0)) DESC, currentMs DESC
    LIMIT 12
  `;

  const pageDailySql = `
    WITH base AS (${base}),
    filtered AS (
      SELECT
        app,
        page,
        duration_ms,
        IF(
          event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY),
          'current',
          'previous'
        ) AS period,
        IF(
          event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY),
          DATE_DIFF(DATE(event_timestamp), DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)), DAY),
          DATE_DIFF(DATE(event_timestamp), DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)), DAY)
        ) AS day_index
      FROM base
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
        AND event_name = '${metric}'
        AND duration_ms IS NOT NULL
    )
    SELECT
      app,
      page,
      day_index AS dayIndex,
      FORMAT_DATE('%b %d', DATE_ADD(DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)), INTERVAL day_index DAY)) AS label,
      AVG(IF(period = 'current', duration_ms, NULL)) AS currentMs,
      AVG(IF(period = 'previous', duration_ms, NULL)) AS previousMs
    FROM filtered
    WHERE day_index BETWEEN 0 AND 6
    GROUP BY app, page, dayIndex, label
    ORDER BY app, page, dayIndex
  `;

  const summarySql = `
    WITH base AS (${base}),
    filtered AS (
      SELECT
        duration_ms,
        event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AS is_current
      FROM base
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
        AND event_name = '${metric}'
        AND duration_ms IS NOT NULL
    )
    SELECT
      AVG(IF(is_current, duration_ms, NULL)) AS currentMs,
      AVG(IF(NOT is_current, duration_ms, NULL)) AS previousMs,
      SAFE_MULTIPLY(
        SAFE_DIVIDE(
          AVG(IF(is_current, duration_ms, NULL)) - AVG(IF(NOT is_current, duration_ms, NULL)),
          AVG(IF(NOT is_current, duration_ms, NULL))
        ),
        100
      ) AS deltaPercent
    FROM filtered
  `;

  const [chartRows, pageRows, pageDailyRows, summaryRows] = await Promise.all([
    queryRows<WebVitalChartPoint>(
      bq,
      projectId,
      dailySql,
      warnings,
      `${metricName} daily`,
    ),
    queryRows<WebVitalPageMetric>(
      bq,
      projectId,
      pageSql,
      warnings,
      `${metricName} pages`,
    ),
    queryRows<WebVitalPageChartRow>(
      bq,
      projectId,
      pageDailySql,
      warnings,
      `${metricName} page daily`,
    ),
    queryRows<{
      currentMs: number | null;
      previousMs: number | null;
      deltaPercent: number | null;
    }>(bq, projectId, summarySql, warnings, `${metricName} summary`),
  ]);

  const summary = summaryRows[0] ?? {
    currentMs: null,
    previousMs: null,
    deltaPercent: null,
  };

  return {
    metricName,
    scope: pageRows[0]?.page ?? "Firebase Performance",
    currentMs: summary.currentMs,
    previousMs: summary.previousMs,
    deltaPercent: summary.deltaPercent,
    chart: completeWeekChart(chartRows),
    pages: pageRows.map((page) => ({
      ...page,
      chart: completeWeekChart(
        pageDailyRows.filter(
          (row) => row.app === page.app && row.page === page.page,
        ),
      ),
    })),
  };
}

async function queryCrashSummary(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  tables: FirebaseBigQueryTable[],
  warnings: string[],
): Promise<CrashMetricRow[]> {
  if (tables.length === 0) return [];
  const sql = `
    SELECT
      app,
      COUNT(*) AS events,
      SUM(IF(error_type = 'FATAL', 1, 0)) AS fatalEvents,
      CAST(MAX(event_timestamp) AS STRING) AS latestEventAt
    FROM (${unionCrashlyticsTables(projectId, tables)})
    WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    GROUP BY app
    ORDER BY fatalEvents DESC, events DESC
  `;
  return queryRows<CrashMetricRow>(bq, projectId, sql, warnings, "Crashlytics summary");
}

async function queryRows<T>(
  bq: ReturnType<typeof google.bigquery>,
  projectId: string,
  query: string,
  warnings: string[],
  label: string,
): Promise<T[]> {
  try {
    const res = await bq.jobs.query({
      projectId,
      requestBody: {
        query,
        useLegacySql: false,
        location: process.env.BIGQUERY_LOCATION?.trim() || "US",
      },
    });
    return ((res.data.rows ?? []).map((row) =>
      Object.fromEntries(
        (res.data.schema?.fields ?? []).map((field, idx) => [
          field.name ?? `field_${idx}`,
          parseBigQueryValue(row.f?.[idx]?.v),
        ]),
      ),
    ) ?? []) as T[];
  } catch (e) {
    warnings.push(`${label}: ${formatError(e)}`);
    return [];
  }
}

function unionPerformanceTables(
  projectId: string,
  tables: FirebaseBigQueryTable[],
): string {
  return tables
    .map(
      (table) => `
        SELECT
          '${escapeSqlString(table.tableId)}' AS app,
          event_timestamp,
          event_type,
          event_name,
          trace_info,
          network_info
        FROM \`${escapeIdentifier(projectId)}.${escapeIdentifier(table.datasetId)}.${escapeIdentifier(table.tableId)}\`
      `,
    )
    .join("\nUNION ALL\n");
}

function webVitalBaseSql(
  projectId: string,
  tables: FirebaseBigQueryTable[],
): string {
  return tables
    .map(
      (table) => `
        SELECT
          '${escapeSqlString(table.tableId)}' AS app,
          event_timestamp,
          event_name,
          trace_info.duration_us / 1000 AS duration_ms,
          COALESCE(
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"page_url"\\s*:\\s*"([^"]+)"'),
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"pageUrl"\\s*:\\s*"([^"]+)"'),
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"page_path"\\s*:\\s*"([^"]+)"'),
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"url"\\s*:\\s*"([^"]+)"'),
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"key"\\s*:\\s*"(?:page_url|pageUrl|page_path|pagePath|url|route|path|host)"[^}]*"value"\\s*:\\s*"([^"]+)"'),
            REGEXP_EXTRACT(TO_JSON_STRING(t), r'"value"\\s*:\\s*"([^"]+)"[^}]*"key"\\s*:\\s*"(?:page_url|pageUrl|page_path|pagePath|url|route|path|host)"'),
            '${escapeSqlString(table.tableId)}'
          ) AS page
        FROM \`${escapeIdentifier(projectId)}.${escapeIdentifier(table.datasetId)}.${escapeIdentifier(table.tableId)}\` AS t
      `,
    )
    .join("\nUNION ALL\n");
}

function unionCrashlyticsTables(
  projectId: string,
  tables: FirebaseBigQueryTable[],
): string {
  return tables
    .map(
      (table) => `
        SELECT
          '${escapeSqlString(table.tableId)}' AS app,
          event_timestamp,
          error_type
        FROM \`${escapeIdentifier(projectId)}.${escapeIdentifier(table.datasetId)}.${escapeIdentifier(table.tableId)}\`
      `,
    )
    .join("\nUNION ALL\n");
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

function completeWeekChart(rows: WebVitalChartPoint[]): WebVitalChartPoint[] {
  const labels = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + idx);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  });

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const row = rows.find((item) => item.dayIndex === dayIndex);
    return {
      dayIndex,
      label: row?.label ?? labels[dayIndex],
      currentMs: row?.currentMs ?? null,
      previousMs: row?.previousMs ?? null,
    };
  });
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
