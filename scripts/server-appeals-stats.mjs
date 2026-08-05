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

const appeals = await sql`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE merged_into_id IS NULL)::int AS active,
    count(*) FILTER (WHERE point_id IS NULL AND merged_into_id IS NULL)::int AS no_point,
    count(*) FILTER (WHERE classification IS NULL AND merged_into_id IS NULL)::int AS no_class,
    count(*) FILTER (WHERE intake_source_code IS NULL AND merged_into_id IS NULL)::int AS no_intake
  FROM support_appeals
`;

const messages = await sql`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE appeal_id IS NULL)::int AS orphan
  FROM support_messages
`;

const bySource = await sql`
  SELECT source, count(*)::int AS c
  FROM support_appeals
  WHERE merged_into_id IS NULL
  GROUP BY source
  ORDER BY c DESC
`;

const orphanSamples = await sql`
  SELECT conversation_key, left(text, 60) AS text, created_at
  FROM support_messages
  WHERE appeal_id IS NULL
  ORDER BY created_at DESC
  LIMIT 10
`;

console.log(
  JSON.stringify(
    {
      env: {
        maxChats: (env.MAX_SUPPORT_CHAT_IDS ?? "").split(",").filter(Boolean).length,
        tgChats: (env.TELEGRAM_SUPPORT_CHAT_IDS ?? "").split(",").filter(Boolean).length,
      },
      appeals: appeals[0],
      messages: messages[0],
      bySource,
      orphanSamples,
    },
    null,
    2,
  ),
);

await sql.end();
