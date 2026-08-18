import { getConfig } from "../config.js";
import { PostgresCRMReader, SchemaContractError } from "./postgres.js";
import { SeedCRMReader } from "./seed.js";
import type { CRMReader } from "./types.js";

export * from "./types.js";
export { SchemaContractError };

let reader: CRMReader | null = null;

/**
 * Единственная точка выбора реализации.
 *
 * Выше слоя crm/ никто не знает, какая из них активна — ни один
 * `if (source === "seed")` в бизнес-логике. Перенос на продукт
 * это смена CRM_SOURCE в конфиге, а не правка кода.
 */
export function getCRMReader(): CRMReader {
  if (reader) return reader;
  const config = getConfig();

  if (config.crmSource === "postgres") {
    if (!config.crmDsn) {
      throw new Error("CRM_SOURCE=postgres, но CRM_DSN не задан");
    }
    reader = new PostgresCRMReader(
      config.crmDsn,
      config.crmPoolSize,
      config.crmStatementTimeoutMs,
    );
  } else {
    reader = new SeedCRMReader();
  }
  return reader;
}

/**
 * Контрактная проверка на старте. Для postgres нехватка колонки —
 * это остановка сервиса, а не предупреждение в логе.
 */
export async function verifyCRMOnStartup(): Promise<void> {
  const config = getConfig();
  const crm = getCRMReader();
  const health = await crm.healthcheck();

  if (config.crmSource === "postgres" && !health.ok) {
    if (health.missing.length > 0) throw new SchemaContractError(health.missing);
    throw new Error(`CRM недоступна: ${health.error ?? "неизвестная причина"}`);
  }
}
