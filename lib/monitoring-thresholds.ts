import type { PerformanceSourceType } from "@/lib/firebase-performance-history";

export const METRIC_SLOW_MS_BY_SOURCE: Record<PerformanceSourceType, number> = {
  site: 1300,
  mobile: 1100,
  mobile_api: 1100,
};

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

/**
 * Порог в миллисекундах применим только к длительностям живых замеров.
 * Балл (Performance Score, 0–100) и лабораторные прогоны PageSpeed
 * под него не подпадают. Дублирует логику
 * services/push-notification-service/src/thresholds.ts — обе копии
 * подлежат переносу в packages/contracts.
 */
export function isAlertableMetric(metric: {
  metricKind?: "duration" | "score";
  isLab?: boolean;
  app?: string;
}): boolean {
  if (metric.metricKind === "score") return false;
  if (metric.isLab === true) return false;
  if (metric.isLab === undefined && metric.app?.startsWith("pagespeed:")) return false;
  return true;
}
