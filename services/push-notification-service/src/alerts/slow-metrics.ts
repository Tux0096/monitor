import { getMonitorWebUrl } from "../config.js";
import type { PerformanceHistoryReport } from "../performance-types.js";
import { evaluatePerformanceReport } from "./evaluate-performance.js";

async function fetchPerformanceReport(): Promise<PerformanceHistoryReport> {
  const secret = process.env.PERFORMANCE_IMPORT_SECRET?.trim();
  if (!secret) {
    throw new Error("PERFORMANCE_IMPORT_SECRET is not configured");
  }

  const response = await fetch(
    `${getMonitorWebUrl()}/api/internal/performance/report`,
    {
      headers: { "x-monitor-import-secret": secret },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `performance report ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  return (await response.json()) as PerformanceHistoryReport;
}

export async function checkSlowMetricsAndPush(): Promise<{
  checked: number;
  notified: number;
  tokens: number;
  errors: string[];
}> {
  const report = await fetchPerformanceReport();
  return evaluatePerformanceReport(report);
}

export { evaluatePerformanceReport };
