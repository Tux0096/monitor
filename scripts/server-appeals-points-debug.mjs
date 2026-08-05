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

const missingPoints = await sql`
  SELECT appeal_number, left(issue_text, 160) AS issue
  FROM support_appeals
  WHERE point_id IS NULL AND merged_into_id IS NULL
  ORDER BY appeal_number
  LIMIT 20
`;

const withPoints = await sql`
  SELECT a.appeal_number, dp.name AS point_name, left(a.issue_text, 80) AS issue
  FROM support_appeals a
  JOIN delivery_points dp ON dp.id = a.point_id
  WHERE a.merged_into_id IS NULL
  ORDER BY a.appeal_number
`;

console.log(JSON.stringify({ missingPoints, withPoints }, null, 2));
await sql.end();
