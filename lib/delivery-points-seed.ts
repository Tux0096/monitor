import postgres from "postgres";
import {
  DELIVERY_POINTS_CATALOG,
  normalizeDeliveryPointName,
} from "@/lib/delivery-points-catalog";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function seedDeliveryPointsCatalog(): Promise<{
  inserted: number;
  skipped: number;
}> {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    return { inserted: 0, skipped: DELIVERY_POINTS_CATALOG.length };
  }

  const client = postgres(url, { max: 2 });
  try {
    const existing = await client`
      SELECT lower(trim(name)) AS normalized_name
      FROM delivery_points
    `;
    const existingNames = new Set(
      existing.map((row) => String(row.normalized_name)),
    );

    let inserted = 0;
    let skipped = 0;

    for (const point of DELIVERY_POINTS_CATALOG) {
      const key = normalizeDeliveryPointName(point.name);
      if (existingNames.has(key)) {
        skipped += 1;
        continue;
      }

      await client`
        INSERT INTO delivery_points (name, city, notes, updated_at)
        VALUES (${point.name}, ${point.city ?? null}, ${point.notes ?? null}, now())
      `;
      existingNames.add(key);
      inserted += 1;
    }

    return { inserted, skipped };
  } finally {
    await client.end({ timeout: 5 });
  }
}
