/**
 * Создание открытых обращений MAX из чата за указный период (Europe/Samara).
 *
 * Запуск на сервере:
 *   node scripts/backfill-max-period.mjs
 *   FROM=2026-06-29 TO=2026-07-05 DRY_RUN=1 node scripts/backfill-max-period.mjs
 */
import fs from "node:fs";
import postgres from "postgres";

const DRY_RUN = process.env.DRY_RUN === "1";
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

const TOKEN = env.MAX_BOT_TOKEN;
const sql = postgres(env.MONITOR_DATABASE_URL, { max: 1 });
const maxApiBase = "https://platform-api.max.ru";

const CATEGORY = {
  mobile_app: { label: "Мобильное приложение", sub: "не работает приложение" },
  phone: { label: "Проблемы с телефоном", sub: "проблема с телефоном" },
  network: { label: "Сеть и связь", sub: "проблема со связью" },
  other: { label: "Другое", sub: "прочее" },
};

function classify(text) {
  const t = text.toLowerCase();
  if (/телефон|звон|sim|сим/i.test(t)) return { ...CATEGORY.phone, key: "phone" };
  if (/сеть|интернет|wifi|wi-fi|связ/i.test(t)) return { ...CATEGORY.network, key: "network" };
  if (/прилож|iiko|смен|вход|логин|пин|пинкод/i.test(t)) return { ...CATEGORY.mobile_app, key: "mobile_app" };
  if (/проблем|не\s+работ/i.test(t)) return { ...CATEGORY.mobile_app, key: "mobile_app" };
  return { ...CATEGORY.other, key: "other" };
}

function shouldRegister(text, hasPhoto) {
  if (hasPhoto) return true;
  const n = text.trim();
  if (!n) return false;
  if (/проблем/i.test(n)) return true;
  if (/не\s+работ/i.test(n)) return true;
  if (/помог|не\s+мог|ошибк|не\s+откры|не\s+заход|не\s+работает|не\s+груз|слом/i.test(n)) return true;
  return false;
}

function extractPhone(text) {
  const m =
    text.match(/(?:\+7|8)?[\s(-]*(\d{3})[\s)-]*(\d{3})[\s-]*(\d{2})[\s-]*(\d{2})/) ??
    text.match(/(\d{11})/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

function formatIssueText({ text, photoUrl, classification }) {
  return [
    `Категория: ${classification.label}`,
    `Подкатегория: ${classification.sub}`,
    "",
    `Проблема: ${text}`,
    photoUrl ? `\nФото: ${photoUrl}` : "",
    `\n[восстановлено из чата MAX ${FROM}–${TO}]`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function localDateKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function inRange(isoOrDate) {
  const key = localDateKey(isoOrDate);
  return key >= FROM && key <= TO;
}

async function resolveChatIds() {
  const fromEnv = (env.MAX_SUPPORT_CHAT_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const rows = await sql`
    SELECT DISTINCT max_chat_id
    FROM support_appeals
    WHERE max_chat_id IS NOT NULL AND trim(max_chat_id) <> ''
    UNION
    SELECT DISTINCT max_chat_id
    FROM support_messages
    WHERE max_chat_id IS NOT NULL AND trim(max_chat_id) <> '' AND max_chat_id NOT LIKE 'tg:%'
  `;
  return rows.map((r) => String(r.max_chat_id)).filter(Boolean);
}

async function fetchMaxMessages(chatId, from) {
  const url = new URL(`${maxApiBase}/messages`);
  url.searchParams.set("chat_id", chatId);
  url.searchParams.set("count", "100");
  if (from != null) url.searchParams.set("from", String(from));
  const res = await fetch(url, { headers: { Authorization: TOKEN } });
  if (!res.ok) throw new Error(`MAX ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  return payload.messages ?? [];
}

function parsePhoto(message) {
  for (const a of message.body?.attachments ?? []) {
    if (a.type === "image" && a.payload?.url) return a.payload.url;
  }
  return null;
}

async function isStored(messageId) {
  if (!messageId) return false;
  const rows = await sql`
    SELECT 1 FROM support_appeals WHERE max_message_id = ${messageId}
    UNION ALL
    SELECT 1 FROM support_messages WHERE max_message_id = ${messageId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function upsertMessage({ chatId, userId, messageId, text, photoUrl, createdAt, conversationKey }) {
  if (await isStored(messageId)) return false;
  if (DRY_RUN) return true;
  await sql`
    INSERT INTO support_messages (
      appeal_id, conversation_key, direction, max_chat_id, max_user_id,
      max_message_id, text, photo_url, created_at
    )
    VALUES (
      NULL, ${conversationKey}, 'in', ${chatId}, ${userId},
      ${messageId}, ${text}, ${photoUrl}, ${createdAt}
    )
  `;
  return true;
}

async function appealExistsForMessage(messageId) {
  if (!messageId) return false;
  const rows = await sql`
    SELECT appeal_number FROM support_appeals WHERE max_message_id = ${messageId} LIMIT 1
  `;
  return rows.length > 0;
}

async function createOpenAppeal(item) {
  const classification = classify(item.text);
  const issueText = formatIssueText({ ...item, classification });
  const phone = extractPhone(item.text);

  if (DRY_RUN) {
    return { action: "would_create", user: item.userId, date: localDateKey(item.createdAt), text: item.text.slice(0, 80) };
  }

  const rows = await sql`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      phone, description_normalized, category, classification, subcategory,
      priority, confidence, classification_source, issue_text, photo_url,
      intake_source_code, created_at, updated_at
    )
    VALUES (
      'max', 'open', ${item.chatId}, ${item.userId}, ${item.messageId}, ${item.senderName},
      ${phone}, ${item.text.toLowerCase().slice(0, 500)}, ${classification.label},
      ${classification.key}, ${classification.sub}, 'normal', 0.7, 'auto', ${issueText},
      ${item.photoUrl}, 'max_courier_chat', ${item.createdAt}, ${item.createdAt}
    )
    RETURNING id, appeal_number
  `;

  const appealId = rows[0].id;
  const linked = await sql`
    UPDATE support_messages
    SET appeal_id = ${appealId}
    WHERE conversation_key = ${item.conversationKey}
      AND appeal_id IS NULL
      AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
      AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
    RETURNING id
  `;

  await sql`
    UPDATE employees
    SET total_appeals = COALESCE(total_appeals, 0) + 1,
        last_appeal_at = GREATEST(COALESCE(last_appeal_at, ${item.createdAt}), ${item.createdAt}),
        phone = COALESCE(phone, ${phone}),
        updated_at = now()
    WHERE max_user_id = ${item.userId}
  `;

  return {
    action: "created",
    appealNumber: rows[0].appeal_number,
    user: item.userId,
    linkedMessages: linked.length,
  };
}

function rangeBounds() {
  const start = new Date(`${FROM}T00:00:00+04:00`).getTime();
  const end = new Date(`${TO}T23:59:59.999+04:00`).getTime();
  return { start, end };
}

async function importFromMaxApi(chatIds) {
  const stats = { fetched: 0, stored: 0, candidates: [] };
  if (!TOKEN) return stats;

  const { start, end } = rangeBounds();

  for (const chatId of chatIds) {
    if (!/^-?\d+$/.test(chatId)) continue;

    let from = end + 1;
    for (let page = 0; page < 200; page += 1) {
      const messages = await fetchMaxMessages(chatId, from);
      if (!messages.length) break;

      const sorted = [...messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      const minTimestamp = sorted[0]?.timestamp ?? from;

      for (const message of sorted) {
        const ts = message.timestamp ?? 0;
        if (ts > end) continue;
        if (ts < start) continue;

        stats.fetched += 1;
        const createdAt = new Date(ts);
        const text = (message.body?.text ?? "").trim();
        const photoUrl = parsePhoto(message);
        const userId = message.sender?.user_id != null ? String(message.sender.user_id) : null;
        if (!userId || message.sender?.is_bot || (!text && !photoUrl)) continue;

        const messageId = message.body?.mid ? String(message.body.mid) : null;
        const conversationKey = `${chatId}:${userId}`;
        const senderName = message.sender?.name ?? message.sender?.first_name ?? null;

        const stored = await upsertMessage({
          chatId,
          userId,
          messageId,
          text,
          photoUrl,
          createdAt,
          conversationKey,
        });
        if (stored) stats.stored += 1;

        if (!shouldRegister(text, Boolean(photoUrl))) continue;
        if (await appealExistsForMessage(messageId)) continue;

        stats.candidates.push({
          chatId,
          userId,
          messageId,
          text: text || "Приложено фото без текста",
          photoUrl,
          createdAt,
          conversationKey,
          senderName,
        });
      }

      if (minTimestamp <= start || messages.length < 100) break;
      from = minTimestamp;
    }
  }

  return stats;
}

async function importFromDbOrphans() {
  const groups = await sql`
    SELECT conversation_key, max(max_chat_id) AS chat_id, max(max_user_id) AS user_id
    FROM support_messages
    WHERE appeal_id IS NULL
      AND direction = 'in'
      AND max_user_id IS NOT NULL
      AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
      AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
    GROUP BY conversation_key
    ORDER BY min(created_at) ASC
  `;

  const results = [];
  for (const group of groups) {
    const messages = await sql`
      SELECT max_chat_id, max_user_id, max_message_id, text, photo_url, created_at
      FROM support_messages
      WHERE conversation_key = ${String(group.conversation_key)}
        AND appeal_id IS NULL
        AND direction = 'in'
        AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
        AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
      ORDER BY created_at ASC
    `;

    for (const row of messages) {
      const text = String(row.text ?? "").trim();
      const photoUrl = row.photo_url ? String(row.photo_url) : null;
      if (!shouldRegister(text, Boolean(photoUrl))) continue;

      const messageId = row.max_message_id ? String(row.max_message_id) : null;
      if (await appealExistsForMessage(messageId)) {
        results.push({ action: "skip_exists", messageId });
        continue;
      }

      const item = {
        chatId: String(row.max_chat_id ?? group.chat_id),
        userId: String(row.max_user_id ?? group.user_id),
        messageId,
        text: text || "Приложено фото без текста",
        photoUrl,
        createdAt: row.created_at,
        conversationKey: String(group.conversation_key),
        senderName: null,
      };
      results.push(await createOpenAppeal(item));
    }
  }
  return results;
}

const chatIds = await resolveChatIds();
const before = await sql`
  SELECT count(*)::int AS c
  FROM support_appeals
  WHERE source = 'max'
    AND merged_into_id IS NULL
    AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
    AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
`;

const apiStats = await importFromMaxApi(chatIds);
const apiResults = [];
for (const item of apiStats.candidates) {
  apiResults.push(await createOpenAppeal(item));
}

const orphanResults = await importFromDbOrphans();

const after = await sql`
  SELECT count(*)::int AS c
  FROM support_appeals
  WHERE source = 'max'
    AND merged_into_id IS NULL
    AND (created_at AT TIME ZONE ${TZ})::date >= ${FROM}::date
    AND (created_at AT TIME ZONE ${TZ})::date <= ${TO}::date
`;

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      period: { from: FROM, to: TO, timezone: TZ },
      chatIds,
      before: before[0].c,
      after: after[0].c,
      api: { fetched: apiStats.fetched, stored: apiStats.stored, created: apiResults.filter((r) => r.action === "created").length },
      apiResults,
      orphanResults,
    },
    null,
    2,
  ),
);

await sql.end();
