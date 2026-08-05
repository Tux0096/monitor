import postgres from "postgres";

import {
  APPEAL_NORM_RATIO,
  calcActualRatioPercent,
  calcDeviation,
  calcNormAppeals,
  endOfIsoWeek,
  formatIsoWeekLabel,
  NORM_CATEGORY,
  startOfIsoWeek,
  toDateString,
} from "@/lib/courier-stat-norms";
import { getRuntimeEnv } from "@/lib/runtime-env";

/** Календарные границы недель — как и вся остальная статистика. */
const APP_TIMEZONE = "Europe/Samara";

export {
  APPEAL_NORM_RATIO,
  calcActualRatioPercent,
  calcDeviation,
  calcNormAppeals,
  endOfIsoWeek,
  formatIsoWeekLabel,
  isWithinNorm,
  NORM_CATEGORY,
  startOfIsoWeek,
  toDateString,
} from "@/lib/courier-stat-norms";

export type CourierWeekStatus = "draft" | "closed";

export type CourierStatWeek = {
  id: string;
  weekStart: string;
  weekEnd: string;
  label: string;
  status: CourierWeekStatus;
  ordersTotal: number | null;
  /** Снапшот на момент закрытия; для draft — живой пересчёт. */
  appealsTotal: number | null;
  appealsMobileApp: number | null;
  normAppeals: number | null;
  deviation: number | null;
  withinNorm: boolean | null;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
};

// ---------------------------------------------------------------------------
// Хранилище
// ---------------------------------------------------------------------------

let sqlClient: postgres.Sql | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) throw new Error("MONITOR_DATABASE_URL is not configured");
  sqlClient ??= postgres(url, { max: 3 });
  return sqlClient;
}

let schemaReady: Promise<void> | null = null;

export async function ensureCourierStatWeeksSchema(): Promise<void> {
  schemaReady ??= migrate().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

async function migrate(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS courier_stat_weeks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      week_start date NOT NULL UNIQUE,
      week_end date NOT NULL,
      label text NOT NULL,
      orders_total integer,
      status text NOT NULL DEFAULT 'draft',
      appeals_total integer,
      appeals_mobile_app integer,
      norm_appeals integer,
      closed_at timestamptz,
      closed_by text,
      reopened_at timestamptz,
      reopened_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS courier_stat_week_audit (
      id bigserial PRIMARY KEY,
      week_id uuid NOT NULL REFERENCES courier_stat_weeks(id) ON DELETE CASCADE,
      action text NOT NULL,
      actor text NOT NULL,
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS courier_stat_week_audit_week_idx
      ON courier_stat_week_audit (week_id, created_at DESC)
  `;
}

async function writeAudit(
  weekId: string,
  action: string,
  actor: string,
  payload: unknown,
): Promise<void> {
  await sql()`
    INSERT INTO courier_stat_week_audit (week_id, action, actor, payload)
    VALUES (${weekId}, ${action}, ${actor}, ${JSON.stringify(payload ?? {})}::jsonb)
  `;
}

// ---------------------------------------------------------------------------
// Подсчёт фактических обращений за период
// ---------------------------------------------------------------------------

/**
 * Обращения курьеров за период.
 *
 * Канал курьеров — это source = 'max' (та же граница, что в readAppealsStatistics).
 * Слитые обращения (merged_into_id IS NOT NULL) не считаются, иначе одно
 * событие учитывалось бы дважды.
 */
export async function countAppealsForPeriod(
  from: string,
  to: string,
): Promise<{ total: number; mobileApp: number }> {
  const rows = (await sql()`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (
        WHERE coalesce(nullif(a.classification, ''), a.category) = ${NORM_CATEGORY}
      )::int AS mobile_app
    FROM support_appeals a
    WHERE a.merged_into_id IS NULL
      AND a.source = 'max'
      AND (a.created_at AT TIME ZONE ${APP_TIMEZONE})::date >= ${from}::date
      AND (a.created_at AT TIME ZONE ${APP_TIMEZONE})::date <= ${to}::date
  `) as Array<{ total: number; mobile_app: number }>;

  return {
    total: rows[0]?.total ?? 0,
    mobileApp: rows[0]?.mobile_app ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Операции над неделями
// ---------------------------------------------------------------------------

type WeekRow = {
  id: string;
  week_start: string;
  week_end: string;
  label: string;
  orders_total: number | null;
  status: string;
  appeals_total: number | null;
  appeals_mobile_app: number | null;
  norm_appeals: number | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
};

/**
 * Для закрытой недели отдаём снапшот, снятый в момент закрытия.
 * Живой пересчёт здесь был бы ошибкой: позднее слияние обращений или
 * переклассификация задним числом молча изменили бы уже сданную отчётность.
 */
async function toWeek(row: WeekRow): Promise<CourierStatWeek> {
  const status: CourierWeekStatus = row.status === "closed" ? "closed" : "draft";

  let appealsTotal = row.appeals_total;
  let appealsMobileApp = row.appeals_mobile_app;
  let normAppeals = row.norm_appeals;

  if (status === "draft") {
    const counts = await countAppealsForPeriod(row.week_start, row.week_end);
    appealsTotal = counts.total;
    appealsMobileApp = counts.mobileApp;
    normAppeals =
      row.orders_total == null ? null : calcNormAppeals(row.orders_total);
  }

  const deviation =
    appealsMobileApp == null || normAppeals == null
      ? null
      : calcDeviation(appealsMobileApp, normAppeals);

  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    label: row.label,
    status,
    ordersTotal: row.orders_total,
    appealsTotal,
    appealsMobileApp,
    normAppeals,
    deviation,
    withinNorm: deviation == null ? null : deviation <= 0,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    reopenedAt: row.reopened_at,
    reopenedBy: row.reopened_by,
  };
}

export async function listCourierStatWeeks(limit = 52): Promise<CourierStatWeek[]> {
  await ensureCourierStatWeeksSchema();
  const rows = (await sql()`
    SELECT * FROM courier_stat_weeks
    ORDER BY week_start DESC
    LIMIT ${limit}
  `) as WeekRow[];
  return Promise.all(rows.map(toWeek));
}

export async function getCourierStatWeek(id: string): Promise<CourierStatWeek | null> {
  await ensureCourierStatWeeksSchema();
  const rows = (await sql()`
    SELECT * FROM courier_stat_weeks WHERE id = ${id} LIMIT 1
  `) as WeekRow[];
  return rows[0] ? toWeek(rows[0]) : null;
}

/**
 * Создаёт неделю в статусе draft. Идемпотентна: повторный вызов на тот же
 * период вернёт существующую запись, а не создаст дубль.
 */
export async function createCourierStatWeek(input: {
  weekStart?: string;
  actor: string;
}): Promise<CourierStatWeek> {
  await ensureCourierStatWeeksSchema();

  const base = input.weekStart ? new Date(input.weekStart) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new Error("Некорректная дата начала недели");
  }

  const weekStart = startOfIsoWeek(base);
  const weekEnd = endOfIsoWeek(weekStart);
  const label = formatIsoWeekLabel(weekStart);

  const rows = (await sql()`
    INSERT INTO courier_stat_weeks (week_start, week_end, label)
    VALUES (${toDateString(weekStart)}, ${toDateString(weekEnd)}, ${label})
    ON CONFLICT (week_start) DO UPDATE SET updated_at = now()
    RETURNING *
  `) as WeekRow[];

  const week = await toWeek(rows[0]);
  await writeAudit(week.id, "created", input.actor, { label });
  return week;
}

export async function setCourierStatWeekOrders(input: {
  id: string;
  ordersTotal: number;
  actor: string;
}): Promise<CourierStatWeek> {
  await ensureCourierStatWeeksSchema();

  if (!Number.isInteger(input.ordersTotal) || input.ordersTotal < 0) {
    throw new Error("Количество заказов должно быть целым неотрицательным числом");
  }

  const current = await getCourierStatWeek(input.id);
  if (!current) throw new Error("Неделя не найдена");
  if (current.status === "closed") {
    throw new Error("Неделя закрыта. Чтобы изменить заказы, сначала переоткройте её");
  }

  const rows = (await sql()`
    UPDATE courier_stat_weeks
    SET orders_total = ${input.ordersTotal}, updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as WeekRow[];

  await writeAudit(input.id, "orders_set", input.actor, {
    ordersTotal: input.ordersTotal,
    previous: current.ordersTotal,
  });
  return toWeek(rows[0]);
}

/**
 * Закрывает неделю и фиксирует снапшот показателей.
 * После закрытия цифры больше не пересчитываются.
 */
export async function closeCourierStatWeek(input: {
  id: string;
  actor: string;
}): Promise<CourierStatWeek> {
  await ensureCourierStatWeeksSchema();

  const current = await getCourierStatWeek(input.id);
  if (!current) throw new Error("Неделя не найдена");
  if (current.status === "closed") throw new Error("Неделя уже закрыта");
  if (current.ordersTotal == null) {
    throw new Error("Перед закрытием нужно указать количество заказов за неделю");
  }

  const counts = await countAppealsForPeriod(current.weekStart, current.weekEnd);
  const normAppeals = calcNormAppeals(current.ordersTotal);

  const rows = (await sql()`
    UPDATE courier_stat_weeks
    SET status = 'closed',
        appeals_total = ${counts.total},
        appeals_mobile_app = ${counts.mobileApp},
        norm_appeals = ${normAppeals},
        closed_at = now(),
        closed_by = ${input.actor},
        updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as WeekRow[];

  await writeAudit(input.id, "closed", input.actor, {
    ordersTotal: current.ordersTotal,
    appealsTotal: counts.total,
    appealsMobileApp: counts.mobileApp,
    normAppeals,
  });
  return toWeek(rows[0]);
}

/** Переоткрытие — только для админа, проверка роли на уровне роута. */
export async function reopenCourierStatWeek(input: {
  id: string;
  actor: string;
}): Promise<CourierStatWeek> {
  await ensureCourierStatWeeksSchema();

  const current = await getCourierStatWeek(input.id);
  if (!current) throw new Error("Неделя не найдена");
  if (current.status !== "closed") throw new Error("Неделя не закрыта");

  const rows = (await sql()`
    UPDATE courier_stat_weeks
    SET status = 'draft',
        reopened_at = now(),
        reopened_by = ${input.actor},
        updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as WeekRow[];

  await writeAudit(input.id, "reopened", input.actor, {
    previousSnapshot: {
      appealsTotal: current.appealsTotal,
      appealsMobileApp: current.appealsMobileApp,
      normAppeals: current.normAppeals,
    },
  });
  return toWeek(rows[0]);
}

/** Сводка только по закрытым неделям — черновики в неё не входят. */
export async function readCourierStatSummary(): Promise<{
  weeks: number;
  ordersTotal: number;
  appealsMobileApp: number;
  normAppeals: number;
  deviation: number;
  actualRatioPercent: number | null;
  weeksWithinNorm: number;
}> {
  await ensureCourierStatWeeksSchema();
  const rows = (await sql()`
    SELECT
      count(*)::int AS weeks,
      coalesce(sum(orders_total), 0)::int AS orders_total,
      coalesce(sum(appeals_mobile_app), 0)::int AS appeals_mobile_app,
      coalesce(sum(norm_appeals), 0)::int AS norm_appeals,
      count(*) FILTER (WHERE appeals_mobile_app <= norm_appeals)::int AS weeks_within_norm
    FROM courier_stat_weeks
    WHERE status = 'closed'
  `) as Array<{
    weeks: number;
    orders_total: number;
    appeals_mobile_app: number;
    norm_appeals: number;
    weeks_within_norm: number;
  }>;

  const row = rows[0];
  const appealsMobileApp = row?.appeals_mobile_app ?? 0;
  const ordersTotal = row?.orders_total ?? 0;
  const normAppeals = row?.norm_appeals ?? 0;

  return {
    weeks: row?.weeks ?? 0,
    ordersTotal,
    appealsMobileApp,
    normAppeals,
    deviation: calcDeviation(appealsMobileApp, normAppeals),
    actualRatioPercent: calcActualRatioPercent(appealsMobileApp, ordersTotal),
    weeksWithinNorm: row?.weeks_within_norm ?? 0,
  };
}
