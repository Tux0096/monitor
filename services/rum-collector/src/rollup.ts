import { getRawRetentionDays } from "./config.js";
import { sql } from "./db/client.js";

/**
 * Свёртка сырых событий в часовые перцентили.
 *
 * Идемпотентна: пересчитывает окно целиком и перезаписывает строки,
 * поэтому повторный запуск не портит данные. Считаем через percentile_cont —
 * непрерывный перцентиль по выборке за час.
 */
export async function rollupHours(hoursBack = 3): Promise<{ hours: number; rows: number }> {
  const result = await sql`
    INSERT INTO rum_rollup_hourly (hour, metric, path_group, platform, source, p50, p75, p95, samples)
    SELECT
      date_trunc('hour', received_at) AS hour,
      metric,
      path_group,
      platform,
      source,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY value) AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95,
      count(*)::int AS samples
    FROM rum_events
    WHERE received_at >= date_trunc('hour', now()) - (${hoursBack}::int * interval '1 hour')
    GROUP BY 1, 2, 3, 4, 5
    ON CONFLICT (hour, metric, path_group, platform, source) DO UPDATE
    SET p50 = EXCLUDED.p50,
        p75 = EXCLUDED.p75,
        p95 = EXCLUDED.p95,
        samples = EXCLUDED.samples
  `;
  return { hours: hoursBack, rows: result.count ?? 0 };
}

/**
 * Удаление сырых событий старше срока хранения.
 * Свёртки не трогаем — они и есть долгая история.
 */
export async function pruneRawEvents(): Promise<number> {
  const days = getRawRetentionDays();
  const result = await sql`
    DELETE FROM rum_events
    WHERE received_at < now() - (${days}::int * interval '1 day')
  `;
  return result.count ?? 0;
}

/** Запускается по расписанию: сначала свернуть, потом подчистить. */
export async function runMaintenance(): Promise<{
  rolledUp: number;
  pruned: number;
}> {
  const { rows } = await rollupHours(3);
  const pruned = await pruneRawEvents();
  return { rolledUp: rows, pruned };
}
