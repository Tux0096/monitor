export type PerformanceSourceType = "site" | "mobile" | "mobile_api";

export type PerformanceHistoryPage = {
  metricName: string;
  app: string;
  page: string;
  sourceType: PerformanceSourceType;
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
