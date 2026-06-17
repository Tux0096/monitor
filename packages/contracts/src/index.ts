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
