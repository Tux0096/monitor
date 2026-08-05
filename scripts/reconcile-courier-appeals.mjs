/**
 * Очистка курьерских обращений: офисные точки, перепривязка точек.
 * Запуск на сервере: node scripts/reconcile-courier-appeals.mjs
 */
import fs from "node:fs";
import postgres from "postgres";

const env = Object.fromEntries(
  fs
    .readFileSync("/opt/monitor/.env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const sql = postgres(env.MONITOR_DATABASE_URL, { max: 1 });
const OFFICE = ["колл центр", "центральный офис", "бухгалтерия"];

const cleared = await sql`
  UPDATE support_appeals a
  SET point_id = NULL, updated_at = now()
  FROM delivery_points p
  WHERE a.point_id = p.id
    AND a.source = 'max'
    AND a.merged_into_id IS NULL
    AND lower(p.name) = ANY(${OFFICE})
  RETURNING a.appeal_number, p.name AS old_point
`;

const fromProfile = await sql`
  UPDATE support_appeals a
  SET point_id = e.point_id, updated_at = now()
  FROM employees e
  JOIN delivery_points p ON p.id = e.point_id
  WHERE a.source = 'max'
    AND a.merged_into_id IS NULL
    AND a.point_id IS NULL
    AND a.max_user_id = e.max_user_id
    AND e.point_id IS NOT NULL
    AND lower(p.name) <> ALL(${OFFICE})
  RETURNING a.appeal_number, p.name AS new_point
`;

const adminAppeals = await sql`
  SELECT a.appeal_number, a.sender_name, a.courier_last_name, a.max_user_id
  FROM support_appeals a
  JOIN employees e ON e.max_user_id = a.max_user_id AND e.is_admin = true
  WHERE a.source = 'max' AND a.merged_into_id IS NULL
  ORDER BY a.appeal_number
`;

console.log(
  JSON.stringify(
    {
      clearedInternalPoints: cleared.length,
      cleared,
      reassignedFromProfile: fromProfile.length,
      fromProfile,
      adminMaxAppealsExcludedFromStats: adminAppeals.length,
      adminAppeals,
    },
    null,
    2,
  ),
);

await sql.end();
