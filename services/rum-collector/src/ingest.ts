import { z } from "zod";

import {
  ALLOWED_METRICS,
  ALLOWED_PLATFORMS,
  ALLOWED_SOURCES,
  METRIC_BOUNDS,
  RUM_PAYLOAD_VERSION,
  type RumMetric,
} from "./config.js";
import { db } from "./db/client.js";
import { rumEvents } from "./db/schema.js";
import { normalizePathGroup } from "./path-group.js";

export { normalizePathGroup };

/**
 * Схема payload. Строгая намеренно: эндпоинт публичный, без авторизации,
 * поэтому принимаем только то, что понимаем, и молча отбрасываем остальное.
 */
const eventSchema = z.object({
  v: z.number().int(),
  metric: z.enum(ALLOWED_METRICS),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional().nullable(),
  path: z.string().max(200),
  platform: z.enum(ALLOWED_PLATFORMS),
  source: z.enum(ALLOWED_SOURCES),
  connection: z.string().max(20).optional().nullable(),
  appVersion: z.string().max(40).optional().nullable(),
});

/** Клиент может слать несколько метрик пачкой — так меньше запросов с устройства. */
const payloadSchema = z.union([eventSchema, z.array(eventSchema).max(20)]);

export type IngestResult = {
  accepted: number;
  rejected: number;
  reasons: string[];
};

function isWithinBounds(metric: RumMetric, value: number): boolean {
  const bounds = METRIC_BOUNDS[metric];
  return value >= bounds.min && value <= bounds.max;
}

export async function ingestPayload(raw: unknown): Promise<IngestResult> {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { accepted: 0, rejected: 1, reasons: ["schema"] };
  }

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const reasons: string[] = [];
  const rows: Array<typeof rumEvents.$inferInsert> = [];

  for (const event of events) {
    if (event.v !== RUM_PAYLOAD_VERSION) {
      // Копия скрипта в одном из репозиториев отстала — это видно в логе,
      // а не проявляется молчаливой потерей данных.
      reasons.push(`version:${event.v}`);
      continue;
    }
    if (!isWithinBounds(event.metric, event.value)) {
      reasons.push(`bounds:${event.metric}`);
      continue;
    }

    rows.push({
      metric: event.metric,
      value: event.value,
      rating: event.rating ?? null,
      pathGroup: normalizePathGroup(event.path),
      platform: event.platform,
      source: event.source,
      connection: event.connection ?? null,
      appVersion: event.appVersion ?? null,
    });
  }

  if (rows.length > 0) {
    await db.insert(rumEvents).values(rows);
  }

  return {
    accepted: rows.length,
    rejected: events.length - rows.length,
    reasons: Array.from(new Set(reasons)),
  };
}
