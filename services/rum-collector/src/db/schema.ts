import {
  bigserial,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Сырые события. Живут ограниченное время (RUM_RAW_RETENTION_DAYS, по умолчанию 14 суток) —
 * иначе таблица съест диск. Долгую историю держат свёртки.
 */
export const rumEvents = pgTable(
  "rum_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    rating: text("rating"),
    pathGroup: text("path_group").notNull(),
    platform: text("platform").notNull(),
    source: text("source").notNull(),
    connection: text("connection"),
    appVersion: text("app_version"),
  },
  (table) => ({
    recentIdx: index("rum_events_recent_idx").on(table.receivedAt, table.metric),
  }),
);

/**
 * Часовые свёртки с перцентилями.
 *
 * Храним p50/p75/p95, а не среднее: распределение времени загрузки скошенное,
 * один запрос на 12 секунд ломает среднее за период. p75 — то, по чему
 * Google оценивает Core Web Vitals.
 */
export const rumRollupHourly = pgTable(
  "rum_rollup_hourly",
  {
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    metric: text("metric").notNull(),
    pathGroup: text("path_group").notNull(),
    platform: text("platform").notNull(),
    source: text("source").notNull(),
    p50: doublePrecision("p50"),
    p75: doublePrecision("p75"),
    p95: doublePrecision("p95"),
    samples: integer("samples").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.hour, table.metric, table.pathGroup, table.platform, table.source],
    }),
  }),
);
