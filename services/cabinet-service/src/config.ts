export type CabinetConfig = {
  port: number;
  databaseUrl: string;
  botToken: string;
  miniappPublicUrl: string;
  crmSource: "seed" | "postgres";
  crmDsn: string | null;
  crmPoolSize: number;
  crmStatementTimeoutMs: number;
  jwtSecret: string;
  accessTtlMin: number;
  refreshTtlDays: number;
  initDataMaxAgeSec: number;
  allowedOrigins: string[];
  serviceSecret: string | null;
};

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let cached: CabinetConfig | null = null;

export function getConfig(): CabinetConfig {
  if (cached) return cached;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const crmSource = process.env.CRM_SOURCE?.trim() === "postgres" ? "postgres" : "seed";

  // JWT-секрет обязателен и в seed-режиме: иначе на тестовом стенде
  // подпись сессий окажется предсказуемой, и привычка утечёт в прод.
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET is required, минимум 32 символа");
  }

  cached = {
    port: num(process.env.PORT, 3106),
    databaseUrl,
    botToken: process.env.CABINET_BOT_TOKEN?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
    miniappPublicUrl:
      process.env.MINIAPP_PUBLIC_URL?.trim() || "https://it.franchise-fuji.ru/cabinet",
    crmSource,
    crmDsn: process.env.CRM_DSN?.trim() || process.env.FUJI_NEW_DATABASE_URL?.trim() || null,
    crmPoolSize: num(process.env.CRM_POOL_SIZE, 5),
    crmStatementTimeoutMs: num(process.env.CRM_STATEMENT_TIMEOUT_MS, 3000),
    jwtSecret,
    accessTtlMin: num(process.env.ACCESS_TTL_MIN, 15),
    refreshTtlDays: num(process.env.REFRESH_TTL_DAYS, 30),
    initDataMaxAgeSec: num(process.env.INIT_DATA_MAX_AGE_SEC, 60),
    allowedOrigins: (
      process.env.CABINET_ALLOWED_ORIGINS?.trim() ||
      "https://it.franchise-fuji.ru,https://web.telegram.org"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    serviceSecret: process.env.PERFORMANCE_IMPORT_SECRET?.trim() || null,
  };
  return cached;
}

/** Для тестов: сбросить кеш конфига между кейсами. */
export function resetConfigCache(): void {
  cached = null;
}
