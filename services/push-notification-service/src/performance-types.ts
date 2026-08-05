export type PerformanceSourceType = "site" | "mobile" | "mobile_api";

export type PerformanceMetricKind = "duration" | "score";

export type PerformanceHistoryPage = {
  metricName: string;
  app: string;
  page: string;
  sourceType: PerformanceSourceType;
  /** Опционально — web мог не прислать (старая версия отчёта). */
  metricKind?: PerformanceMetricKind;
  isLab?: boolean;
  currentMs: number | null;
  previousMs: number | null;
  deltaPercent: number | null;
  samples: number;
};

export type PerformanceHistoryReport = {
  metricName: string;
  pages: PerformanceHistoryPage[];
  fetchedAt: string;
  from: string;
  to: string;
};
