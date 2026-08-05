import fs from "node:fs";
import postgres from "postgres";

const FROM = process.env.FROM ?? "2026-06-29";
const TO = process.env.TO ?? "2026-07-05";
const TZ = "Europe/Samara";

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
const TOKEN = env.MAX_BOT_TOKEN;
const chatId = "-73530431297705";

const appeals = await sql`
  SELECT appeal_number, status, left(issue_text, 80) AS issue, created_at
  FROM support_appeals
  WHERE source = 'max' AND merged_into_id IS NULL
    AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
    AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
  ORDER BY created_at
`;

const messages = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE appeal_id IS NULL)::int AS orphan
  FROM support_messages
  WHERE max_chat_id = ${chatId}
    AND direction = 'in'
    AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
    AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
`;

const samples = await sql`
  SELECT left(text, 100) AS text, photo_url IS NOT NULL AS has_photo,
         appeal_id IS NOT NULL AS linked, created_at, max_message_id
  FROM support_messages
  WHERE max_chat_id = ${chatId}
    AND direction = 'in'
    AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
    AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
  ORDER BY created_at ASC
  LIMIT 20
`;

const start = new Date(`${FROM}T00:00:00+04:00`).getTime() - 1;
const url = new URL("https://platform-api.max.ru/messages");
url.searchParams.set("chat_id", chatId);
url.searchParams.set("count", "100");
url.searchParams.set("from", String(start));

let apiSample = null;
let apiError = null;
try {
  const res = await fetch(url, { headers: { Authorization: TOKEN } });
  const body = await res.json();
  if (!res.ok) apiError = { status: res.status, body };
  else {
    const msgs = body.messages ?? [];
    apiSample = {
      count: msgs.length,
      first: msgs[0]
        ? {
            ts: msgs[0].timestamp,
            date: new Date(msgs[0].timestamp).toISOString(),
            text: (msgs[0].body?.text ?? "").slice(0, 80),
          }
        : null,
      last: msgs.at(-1)
        ? {
            ts: msgs.at(-1).timestamp,
            date: new Date(msgs.at(-1).timestamp).toISOString(),
          }
        : null,
    };
  }
} catch (e) {
  apiError = String(e);
}

console.log(JSON.stringify({ appeals, messages: messages[0], samples, apiSample, apiError }, null, 2));
await sql.end();
