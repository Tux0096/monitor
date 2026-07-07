#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const catalog = [
  "Димитр. 110 Люликова",
  "Бухгалтерия",
  "Центральный офис",
  "Колл центр",
  "Сергей Лазо 24 Крохмалев",
  "Новокуйб. Ковалкин",
  "Д.Донского, 12 Кудряшов",
  "Молодогв. 135 Максимова",
  "Димитр 131 Скворцов",
  "Революц. 70 Скворцов",
  "Физкультурная 98 Иконникова",
  "Тольятти Льва Яшина 16 Головин",
  "Дыбенко120.Кошкарова",
  "Долотный, 9(116) Панарин",
  "Крутые Ключи Панарин",
  "склад",
  "Фабрика(П)",
  "Тольятти Карла Маркса 76  Сайгина",
  "Стара Загора 60 Сидоренко",
  "Коммунист.27 Исаева Н.А",
  "Тольятти Автостроителей 56 Сайгина",
  "Николаевск 38 Кудряшов",
  "Просека 163 Кривотулова",
  "Ст.Загора 124 Латухина",
  "Ново-Садов. 24 Головин",
  "Фабрика",
  "Осетинская 12 Прохорова",
  "Лукачева 6 Сафонов В А",
  "Ленинградск. 60 Рожков",
];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/\r$/, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile("/opt/monitor/.env.local");
loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.MONITOR_DATABASE_URL;
if (!url) {
  console.error("MONITOR_DATABASE_URL is required");
  process.exit(1);
}

function inferCity(name) {
  if (/^Тольятти/i.test(name)) return "Тольятти";
  if (/^Николаевск/i.test(name)) return "Николаевск";
  return "Самара";
}

function normalize(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const client = postgres(url, { max: 2 });
try {
  await client`
    CREATE TABLE IF NOT EXISTS delivery_points (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      city text,
      notes text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const existing = await client`
    SELECT lower(trim(name)) AS normalized_name
    FROM delivery_points
  `;
  const existingNames = new Set(existing.map((row) => String(row.normalized_name)));

  let inserted = 0;
  for (const name of catalog) {
    const key = normalize(name);
    if (existingNames.has(key)) continue;
    await client`
      INSERT INTO delivery_points (name, city, updated_at)
      VALUES (${name}, ${inferCity(name)}, now())
    `;
    existingNames.add(key);
    inserted += 1;
  }

  const total = await client`SELECT count(*)::int AS count FROM delivery_points`;
  console.log(JSON.stringify({ inserted, total: total[0]?.count ?? 0 }));
} finally {
  await client.end({ timeout: 5 });
}
