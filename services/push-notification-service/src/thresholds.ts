import type { PerformanceSourceType } from "./performance-types.js";

export const METRIC_SLOW_MS_BY_SOURCE: Record<PerformanceSourceType, number> = {
  site: 1300,
  mobile: 1100,
  mobile_api: 1100,
};

export const PERFORMANCE_TAB_LABELS: Record<PerformanceSourceType, string> = {
  site: "Сайт",
  mobile: "Приложение",
  mobile_api: "API приложения",
};

export const DASHBOARD_TAB_URLS = {
  dashboard: "/dashboard",
  appeals: "/dashboard/appeals",
  appeals_report: "/dashboard/appeals-report",
  courier_report: "/dashboard/courier-report",
} as const;

export function getMetricSlowMs(sourceType: PerformanceSourceType): number {
  return METRIC_SLOW_MS_BY_SOURCE[sourceType];
}

export function getMetricSlowLabel(sourceType: PerformanceSourceType): string {
  const ms = getMetricSlowMs(sourceType);
  if (ms >= 1000) {
    return `${Number((ms / 1000).toFixed(1))} с`;
  }
  return `${ms} мс`;
}

export function isMetricSlow(
  ms: number | null | undefined,
  sourceType: PerformanceSourceType,
): boolean {
  return (ms ?? 0) > getMetricSlowMs(sourceType);
}

export function resolveAlertUrl(path: string): string {
  const base = process.env.PUBLIC_APP_URL?.trim() || "https://it.franchise-fuji.ru";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
