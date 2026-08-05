/**
 * Проставляет тип «Неактуальные данные курьеров» закрытым обращениям,
 * где решение — обновление данных.
 *
 * node scripts/backfill-stale-data-category.mjs
 * DRY_RUN=1 node scripts/backfill-stale-data-category.mjs
 */
import fs from "node:fs";
import postgres from "postgres";

const DRY_RUN = process.env.DRY_RUN === "1";

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

const LABEL = "Неактуальные данные курьеров";
const KEY = "stale_courier_data";
const SUB = "данные курьера";

function patchIssueTextCategory(issueText) {
  const lines = issueText.split("\n");
  let hasCategory = false;
  let hasSubcategory = false;
  const next = lines.map((line) => {
    if (line.startsWith("Категория:")) {
      hasCategory = true;
      return `Категория: ${LABEL}`;
    }
    if (line.startsWith("Подкатегория:")) {
      hasSubcategory = true;
      return `Подкатегория: ${SUB}`;
    }
    return line;
  });
  const prefix = [];
  if (!hasCategory) prefix.push(`Категория: ${LABEL}`);
  if (!hasSubcategory) prefix.push(`Подкатегория: ${SUB}`);
  return [...prefix, ...next].join("\n");
}

const rows = await sql`
  SELECT id, appeal_number, result_text, issue_text
  FROM support_appeals
  WHERE merged_into_id IS NULL
    AND status = 'closed'
    AND classification <> ${KEY}
    AND result_text IS NOT NULL
    AND result_text ~* 'данн'
    AND result_text ~* 'обнов'
  ORDER BY appeal_number
`;

const results = [];
for (const row of rows) {
  if (DRY_RUN) {
    results.push({ action: "would_update", appealNumber: row.appeal_number, result: row.result_text });
    continue;
  }
  const issueText = patchIssueTextCategory(String(row.issue_text ?? ""));
  await sql`
    UPDATE support_appeals
    SET classification = ${KEY},
        category = ${LABEL},
        subcategory = ${SUB},
        classification_source = 'operator',
        confidence = 1,
        issue_text = ${issueText},
        updated_at = now()
    WHERE id = ${row.id}
  `;
  results.push({ action: "updated", appealNumber: row.appeal_number });
}

console.log(JSON.stringify({ dryRun: DRY_RUN, total: rows.length, results }, null, 2));
await sql.end();
