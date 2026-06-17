import postgres from "postgres";
import { ensureAppealsSchema } from "@/lib/appeals";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type DeliveryPoint = {
  id: string;
  name: string;
  city: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

let sqlClient: postgres.Sql | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    throw new Error("MONITOR_DATABASE_URL is not configured");
  }
  sqlClient ??= postgres(url, { max: 5 });
  return sqlClient;
}

export async function listDeliveryPoints(activeOnly = false): Promise<DeliveryPoint[]> {
  await ensureAppealsSchema();
  const rows = activeOnly
    ? await sql()`
        SELECT *
        FROM delivery_points
        WHERE is_active = true
        ORDER BY name ASC
      `
    : await sql()`
        SELECT *
        FROM delivery_points
        ORDER BY name ASC
      `;
  return rows.map(toDeliveryPoint);
}

export async function getDeliveryPoint(id: string): Promise<DeliveryPoint | null> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT *
    FROM delivery_points
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? toDeliveryPoint(rows[0]) : null;
}

export async function createDeliveryPoint(input: {
  name: string;
  city?: string | null;
  notes?: string | null;
}): Promise<DeliveryPoint> {
  await ensureAppealsSchema();
  const name = input.name.trim();
  if (!name) {
    throw new Error("Укажите название точки");
  }
  const rows = await sql()`
    INSERT INTO delivery_points (name, city, notes, updated_at)
    VALUES (${name}, ${input.city?.trim() || null}, ${input.notes?.trim() || null}, now())
    RETURNING *
  `;
  return toDeliveryPoint(rows[0]);
}

export async function updateDeliveryPoint(
  id: string,
  input: {
    name?: string;
    city?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
): Promise<DeliveryPoint | null> {
  await ensureAppealsSchema();
  const existing = await getDeliveryPoint(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) {
    throw new Error("Укажите название точки");
  }

  const rows = await sql()`
    UPDATE delivery_points
    SET name = ${name},
        city = ${input.city !== undefined ? input.city?.trim() || null : existing.city},
        notes = ${input.notes !== undefined ? input.notes?.trim() || null : existing.notes},
        is_active = ${input.isActive ?? existing.isActive},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return toDeliveryPoint(rows[0]);
}

function toDeliveryPoint(row: postgres.Row): DeliveryPoint {
  return {
    id: String(row.id),
    name: String(row.name),
    city: row.city ? String(row.city) : null,
    notes: row.notes ? String(row.notes) : null,
    isActive: Boolean(row.is_active ?? true),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
