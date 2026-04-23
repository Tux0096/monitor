export type MonitorTarget = {
  id: string;
  name: string;
  url: string;
  expectStatus?: number[];
  timeoutMs?: number;
  source?: "file" | "sheet";
};

export type CheckStatus = "ok" | "degraded" | "down" | "checking";

export type CheckResult = {
  id: string;
  name: string;
  url: string;
  status: CheckStatus;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
  checkedAt: string;
};

export type MonitorSnapshot = {
  results: CheckResult[];
  lastError?: string;
  meta?: {
    intervalMs?: number;
  };
};
