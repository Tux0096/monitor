import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_CABINET_URL = "http://127.0.0.1:3106";

export type CabinetHealth = {
  status: string;
  service: string;
  version: string;
  crmSource: "seed" | "postgres";
};

export type CabinetCrmHealth = {
  source: "seed" | "postgres";
  ok: boolean;
  missing: string[];
  checkedAt: string;
  error?: string;
};

export type CabinetOverview = {
  available: boolean;
  health: CabinetHealth | null;
  crm: CabinetCrmHealth | null;
  users: number;
  activeSessions: number;
  pendingLinkRequests: number;
  error: string | null;
};

function baseUrl(): string {
  return getRuntimeEnv("CABINET_SERVICE_URL")?.trim() || DEFAULT_CABINET_URL;
}

/**
 * Ошибки не глушим: недоступный сервис должен быть виден на вкладке,
 * а не выглядеть как «данных нет».
 */
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl()}${path}`, { cache: "no-store" });
    if (!response.ok) {
      console.error(`[cabinet] ${path}: ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(
      `[cabinet] ${path} недоступен:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function readCabinetOverview(): Promise<CabinetOverview> {
  const [health, crm] = await Promise.all([
    fetchJson<CabinetHealth>("/health"),
    fetchJson<CabinetCrmHealth>("/healthz/crm"),
  ]);

  if (!health) {
    return {
      available: false,
      health: null,
      crm,
      users: 0,
      activeSessions: 0,
      pendingLinkRequests: 0,
      error: "Сервис кабинета не отвечает. Проверьте контейнер monitor-cabinet-service.",
    };
  }

  // Счётчики читаем напрямую: таблицы cab_* лежат в той же monitor_core,
  // отдельного эндпоинта ради трёх чисел заводить не стоит.
  let users = 0;
  let activeSessions = 0;
  let pendingLinkRequests = 0;

  try {
    const postgres = (await import("postgres")).default;
    const url = getRuntimeEnv("MONITOR_DATABASE_URL");
    if (url) {
      const sql = postgres(url, { max: 1 });
      try {
        const [row] = (await sql`
          SELECT
            (SELECT count(*) FROM cab_app_user WHERE disabled_at IS NULL)::int AS users,
            (SELECT count(*) FROM cab_app_session
              WHERE revoked_at IS NULL AND expires_at > now())::int AS sessions,
            (SELECT count(*) FROM cab_link_request WHERE status = 'pending')::int AS pending
        `) as Array<{ users: number; sessions: number; pending: number }>;
        users = row?.users ?? 0;
        activeSessions = row?.sessions ?? 0;
        pendingLinkRequests = row?.pending ?? 0;
      } finally {
        await sql.end();
      }
    }
  } catch (error) {
    // Таблиц ещё нет — миграции не прогонялись. Не ошибка вкладки.
    console.warn(
      "[cabinet] счётчики недоступны:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    available: true,
    health,
    crm,
    users,
    activeSessions,
    pendingLinkRequests,
    error: null,
  };
}
