/**
 * Проверка: нет офисных точек и админов в курьерской статистике.
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

const office = await sql`
  SELECT a.appeal_number, p.name
  FROM support_appeals a
  JOIN delivery_points p ON p.id = a.point_id
  WHERE a.source = 'max'
    AND a.merged_into_id IS NULL
    AND lower(p.name) IN ('колл центр', 'центральный офис', 'бухгалтерия')
`;

const adminIds = await sql`
  SELECT max_user_id FROM employees WHERE is_admin = true AND max_user_id IS NOT NULL
`;
const adminSet = new Set(adminIds.map((r) => String(r.max_user_id)));

const courier = await sql`
  SELECT a.appeal_number, a.max_user_id, a.sender_name, a.courier_last_name, p.name AS point_name
  FROM support_appeals a
  LEFT JOIN delivery_points p ON p.id = a.point_id
  WHERE a.source = 'max' AND a.merged_into_id IS NULL
  ORDER BY a.appeal_number
`;

const visible = courier.filter((row) => !adminSet.has(String(row.max_user_id ?? "")));

console.log(
  JSON.stringify(
    {
      officePointsRemaining: office.length,
      office,
      totalCourierInDb: courier.length,
      visibleAfterAdminFilter: visible.length,
      excludedAdminAppeals: courier.length - visible.length,
      imukovInVisible: visible.some((r) => String(r.max_user_id) === "6597525"),
      kolCentrInVisible: visible.some((r) =>
        String(r.point_name ?? "").toLowerCase().includes("колл центр"),
      ),
    },
    null,
    2,
  ),
);

await sql.end();
