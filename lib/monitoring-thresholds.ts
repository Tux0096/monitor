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
