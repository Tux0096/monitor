// Общие контракты API между сервисами Monitor

export type HealthResponse = {
  status: "ok" | "degraded" | "down";
  service: string;
  version?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin";
};

export type LoginRequest = {
  email?: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};

export type ValidateTokenResponse = {
  valid: boolean;
  user?: AuthUser;
};

export const AUTH_API_PREFIX = "/auth/v1";

export const PUSH_API_PREFIX = "/push/v1";

export type PerformanceSourceType = "site" | "mobile" | "mobile_api";

export const METRIC_SLOW_MS_BY_SOURCE: Record<PerformanceSourceType, number> = {
  site: 1300,
  mobile: 1100,
  mobile_api: 1100,
};

export type PushConfigResponse =
  | { enabled: false }
  | {
      enabled: true;
      apiKey: string;
      authDomain: string;
      projectId: string;
      messagingSenderId: string;
      appId: string;
      vapidKey: string;
    };

export type PushSubscribeRequest = {
  token: string;
  platform?: string;
};

export type PushNotifyRequest = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  domain?: "dashboard" | "appeals" | "appeals_report" | "courier_report";
  cooldownMinutes?: number;
  dedupeKey?: string;
};

export type PushSlowMetricsResult = {
  checked: number;
  notified: number;
  tokens: number;
  errors: string[];
  checkedAt?: string;
};

export const DASHBOARD_PUSH_DOMAINS = [
  "dashboard",
  "appeals",
  "appeals_report",
  "courier_report",
] as const;

export type DashboardPushDomain = (typeof DASHBOARD_PUSH_DOMAINS)[number];
