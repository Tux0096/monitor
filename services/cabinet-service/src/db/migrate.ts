import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

/**
 * Миграции кабинета. Идемпотентны (CREATE TABLE IF NOT EXISTS) и применяются
 * к monitor_core, где уже живут таблицы продукта. Затрагивают только cab_*.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const sql = postgres(url, { max: 1 });
const dir = path.resolve("drizzle");

await sql`
  CREATE TABLE IF NOT EXISTS cab_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let applied = 0;

for (const file of files) {
  const done = await sql`SELECT 1 FROM cab_migrations WHERE name = ${file} LIMIT 1`;
  if (done.length > 0) continue;
  const body = await readFile(path.join(dir, file), "utf-8");
  await sql.unsafe(body);
  await sql`INSERT INTO cab_migrations (name) VALUES (${file})`;
  console.log(`applied ${file}`);
  applied += 1;
}

await sql.end();
console.log(`Cabinet migrations: ${applied} applied, ${files.length} total`);
