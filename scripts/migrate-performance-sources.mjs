/**
 * Одноразовая миграция firebase_performance_daily:
 * - синтетические пробы приложения → mobile_api
 * - удаление устаревших site-проб без /samara/
 *
 * Запуск на сервере: node scripts/migrate-performance-sources.mjs
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

const moved = await sql`
  UPDATE firebase_performance_daily
  SET source_type = 'mobile_api'
  WHERE source_type = 'mobile'
    AND app LIKE 'probe:%'
  RETURNING 1
`;

const deleted = await sql`
  DELETE FROM firebase_performance_daily
  WHERE source_type = 'site'
    AND app = 'probe:site'
    AND page ~ '^https://fuji\\.ru/(?!samara)'
  RETURNING 1
`;

console.log(
  JSON.stringify({
    movedToMobileApi: moved.length,
    deletedStaleSite: deleted.length,
  }),
);

await sql.end();
