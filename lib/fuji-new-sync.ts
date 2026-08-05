import postgres from "postgres";

import { getRuntimeEnv } from "@/lib/runtime-env";

// Real HR/ops database (read-only "metabase" account). Source of truth for
// couriers (workers) and delivery points (departments) — our own catalog was
// hand-seeded and had drifted (duplicate points, near-empty courier phones).
const COURIER_POST_IDS = [48, 93, 138]; // "Курьер", "Курьер консоль", "Пеший курьер"

let monitorSqlClient: postgres.Sql | null = null;
let fujiNewSqlClient: postgres.Sql | null = null;

function monitorSql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) throw new Error("MONITOR_DATABASE_URL is not configured");
  monitorSqlClient ??= postgres(url, { max: 3 });
  return monitorSqlClient;
}

function fujiNewSql() {
  const url = getRuntimeEnv("FUJI_NEW_DATABASE_URL");
  if (!url) throw new Error("FUJI_NEW_DATABASE_URL is not configured");
  fujiNewSqlClient ??= postgres(url, { max: 2 });
  return fujiNewSqlClient;
}

async function ensureSyncSchema() {
  const sql = monitorSql();
  await sql`ALTER TABLE delivery_points ADD COLUMN IF NOT EXISTS external_department_id integer`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS delivery_points_external_department_id_idx
    ON delivery_points (external_department_id)
    WHERE external_department_id IS NOT NULL
  `;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS external_worker_id integer`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS employees_external_worker_id_idx
    ON employees (external_worker_id)
    WHERE external_worker_id IS NOT NULL
  `;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export type DeliveryPointsSyncResult = {
  departmentsSeen: number;
  adopted: number;
  created: number;
  duplicatesMerged: number;
};

export async function syncDeliveryPointsFromFujiNew(): Promise<DeliveryPointsSyncResult> {
  await ensureSyncSchema();
  const sql = monitorSql();

  const departments = await fujiNewSql()`
    SELECT id, name, city FROM departments WHERE closing_date IS NULL ORDER BY id
  `;

  let adopted = 0;
  let created = 0;
  let duplicatesMerged = 0;

  for (const dep of departments) {
    const name = String(dep.name ?? "").trim();
    if (!name) continue;
    const city = dep.city ? String(dep.city).trim() : null;

    const alreadyLinked = await sql`
      SELECT id FROM delivery_points WHERE external_department_id = ${dep.id}
    `;
    if (alreadyLinked[0]) {
      await sql`
        UPDATE delivery_points
        SET name = ${name}, city = ${city}, is_active = true, updated_at = now()
        WHERE id = ${alreadyLinked[0].id}
      `;
      continue;
    }

    const candidates = await sql`
      SELECT id FROM delivery_points
      WHERE external_department_id IS NULL AND trim(name) = ${name}
      ORDER BY created_at ASC
    `;

    if (candidates.length === 0) {
      await sql`
        INSERT INTO delivery_points (name, city, external_department_id, is_active)
        VALUES (${name}, ${city}, ${dep.id}, true)
      `;
      created += 1;
      continue;
    }

    const canonicalId = candidates[0].id as string;
    await sql`
      UPDATE delivery_points
      SET external_department_id = ${dep.id}, city = ${city}, is_active = true, updated_at = now()
      WHERE id = ${canonicalId}
    `;
    adopted += 1;

    for (const dup of candidates.slice(1)) {
      await sql`UPDATE support_appeals SET point_id = ${canonicalId} WHERE point_id = ${dup.id}`;
      await sql`UPDATE employees SET point_id = ${canonicalId} WHERE point_id = ${dup.id}`;
      await sql`DELETE FROM delivery_points WHERE id = ${dup.id}`;
      duplicatesMerged += 1;
    }
  }

  return { departmentsSeen: departments.length, adopted, created, duplicatesMerged };
}

export type CourierSyncResult = {
  workersConsidered: number;
  matchedByPhone: number;
  matchedByTelegram: number;
  updated: number;
};

export async function syncCouriersFromFujiNew(): Promise<CourierSyncResult> {
  await ensureSyncSchema();
  const sql = monitorSql();

  const workers = await fujiNewSql()`
    SELECT id, f_name, l_name, o_name, phone_number, telegram_id, department_id
    FROM workers
    WHERE post_id = ANY(${COURIER_POST_IDS}) AND dismissal_date IS NULL
  `;

  const byPhone = new Map<string, (typeof workers)[number]>();
  const byTelegram = new Map<string, (typeof workers)[number]>();
  for (const worker of workers) {
    const phone = normalizePhone(worker.phone_number as string | null);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, worker);
    if (worker.telegram_id != null) byTelegram.set(String(worker.telegram_id), worker);
  }

  const employees = await sql`
    SELECT id, phone, telegram_account, last_name, point_id, external_worker_id FROM employees
  `;

  let matchedByPhone = 0;
  let matchedByTelegram = 0;
  let updated = 0;

  for (const employee of employees) {
    if (employee.external_worker_id) continue;

    let worker: (typeof workers)[number] | undefined;
    const phone = normalizePhone(employee.phone as string | null);
    if (phone && byPhone.has(phone)) {
      worker = byPhone.get(phone);
      matchedByPhone += 1;
    } else if (employee.telegram_account && byTelegram.has(String(employee.telegram_account))) {
      worker = byTelegram.get(String(employee.telegram_account));
      matchedByTelegram += 1;
    }
    if (!worker) continue;

    const fullName = [worker.l_name, worker.f_name, worker.o_name]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim();

    let pointId: string | null = null;
    if (worker.department_id != null) {
      const point = await sql`
        SELECT id FROM delivery_points WHERE external_department_id = ${worker.department_id}
      `;
      pointId = point[0]?.id ?? null;
    }

    await sql`
      UPDATE employees
      SET external_worker_id = ${worker.id},
          last_name = COALESCE(NULLIF(last_name, ''), ${fullName || null}),
          point_id = COALESCE(point_id, ${pointId}),
          updated_at = now()
      WHERE id = ${employee.id}
    `;
    updated += 1;
  }

  return { workersConsidered: workers.length, matchedByPhone, matchedByTelegram, updated };
}

export async function runFujiNewSync() {
  const points = await syncDeliveryPointsFromFujiNew();
  const couriers = await syncCouriersFromFujiNew();
  return { points, couriers };
}
