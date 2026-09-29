/**
 * Восстановление обращений из сообщений MAX чата (17–24.06.2026),
 * которые бот получил, но не зарегистрировал как обращения.
 *
 * Запуск: node scripts/backfill-max-appeals.mjs
 * Dry-run: DRY_RUN=1 node scripts/backfill-max-appeals.mjs
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

const CHAT_ID =
  env.MAX_SUPPORT_CHAT_IDS?.split(",")[0]?.trim() || "-73530431297705";

const sql = postgres(env.MONITOR_DATABASE_URL, { max: 1 });

function formatIssueText(fields) {
  return [
    `Категория: ${fields.categoryLabel}`,
    `Подкатегория: ${fields.subcategory}`,
    `Фамилия: ${fields.lastName ?? "не указана"}`,
    `Телефон: ${fields.phone ?? "не указан"}`,
    fields.phoneModel ? `Модель телефона: ${fields.phoneModel}` : "",
    "",
    `Проблема: ${fields.description}`,
    fields.photoUrl ? `\nФото: ${fields.photoUrl}` : "",
    "\n[восстановлено из чата MAX 17–24.06.2026]",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

const newAppeals = [
  {
    maxUserId: "242618429",
    maxMessageId: "mid.ffffbd1fdcc32757019eda3ae8240d1e",
    createdAt: "2026-06-18 10:15:55+00",
    senderName: "Мария",
    lastName: "Гурина",
    phone: null,
    phoneModel: null,
    description:
      "Уже неделю не могу войти. В аккаунт вошла — смену в iiko открыли, в приложении смена не открывается. Гурина Мария Юрьевна, работаю под 3-м лицом Белоусова Александра Ивановна. Пинкод 1111 / 4198.",
    photoUrl:
      "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr89wFgI5XOYp5SGHdDC6iaIIK3JgLXhD7aaRrsUkAbvRs",
    classification: "mobile_app",
    categoryLabel: "Мобильное приложение",
    subcategory: "не работает приложение",
  },
  {
    maxUserId: "242568600",
    maxMessageId: "mid.ffffbd1fdcc32757019edb57f1e357bb",
    createdAt: "2026-06-18 15:27:16+00",
    senderName: "Владимир",
    lastName: null,
    phone: null,
    phoneModel: null,
    description:
      "У меня такая же проблема с мобильным приложением. Когда уже исправите?",
    photoUrl:
      "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8YKs_lBYsw30_tUYWxfMo1IK3JgLXhD7aaRrsUkAbvRs",
    classification: "mobile_app",
    categoryLabel: "Мобильное приложение",
    subcategory: "не работает приложение",
  },
  {
    maxUserId: "224130914",
    maxMessageId: "mid.ffffbd1fdcc32757019ed58d19e90c4d",
    createdAt: "2026-06-17 12:27:36+00",
    senderName: "Айрат Григорьевич",
    lastName: "Григорьевич",
    phone: "+79277961490",
    phoneModel: "Айфон",
    description:
      "Мустайкин сз124 не заходит в приложение (новый курьер). После рекомендаций из обращения №5 — не помогло.",
    photoUrl:
      "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8X35pH3HXb9MXUL2opuI7hoK3JgLXhD7aaRrsUkAbvRs",
    classification: "mobile_app",
    categoryLabel: "Мобильное приложение",
    subcategory: "не работает приложение",
  },
  {
    maxUserId: "235002057",
    maxMessageId: "mid.ffffbd1fdcc32757019ed48377610322",
    createdAt: "2026-06-17 07:37:27+00",
    senderName: "Павел",
    lastName: null,
    phone: null,
    phoneModel: null,
    description:
      "Курьер отправил скриншот проблемы в чат поддержки без текста (бот не зарегистрировал обращение).",
    photoUrl:
      "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8phfnrc8-_pBb0bdsfY5BrYK3JgLXhD7aaRrsUkAbvRs",
    classification: "other",
    categoryLabel: "Другое",
    subcategory: "скриншот без текста",
  },
  {
    maxUserId: "212286837",
    maxMessageId: "mid.ffffbd1fdcc32757019ee654200a6ac3",
    createdAt: "2026-06-20 18:38:56+00",
    senderName: "Александр",
    lastName: null,
    phone: null,
    phoneModel: null,
    description:
      "Курьер отправил скриншот проблемы в чат поддержки без текста (бот не зарегистрировал обращение).",
    photoUrl:
      "https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8woopL3HVM0owsXOT2TsjFoK3JgLXhD7aaRrsUkAbvRs",
    classification: "other",
    categoryLabel: "Другое",
    subcategory: "скриншот без текста",
  },
];

const results = [];

for (const item of newAppeals) {
  const exists = await sql`
    SELECT appeal_number FROM support_appeals WHERE max_message_id = ${item.maxMessageId} LIMIT 1`;
  if (exists.length > 0) {
    results.push({ action: "skip_exists", messageId: item.maxMessageId, appeal: exists[0].appeal_number });
    continue;
  }

  const issueText = formatIssueText(item);
  const conversationKey = `${CHAT_ID}:${item.maxUserId}`;

  if (DRY_RUN) {
    results.push({ action: "would_create", user: item.maxUserId, description: item.description.slice(0, 80) });
    continue;
  }

  const rows = await sql`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      courier_last_name, phone, phone_model, description_normalized, category,
      classification, subcategory, priority, confidence, classification_source,
      issue_text, created_at, updated_at
    )
    VALUES (
      'max', 'open', ${CHAT_ID}, ${item.maxUserId}, ${item.maxMessageId}, ${item.senderName},
      ${item.lastName}, ${item.phone}, ${item.phoneModel},
      ${item.description.toLowerCase().slice(0, 500)}, ${item.categoryLabel},
      ${item.classification}, ${item.subcategory}, 'normal', 0.75, 'auto',
      ${issueText}, ${item.createdAt}::timestamptz, ${item.createdAt}::timestamptz
    )
    RETURNING id, appeal_number`;

  const appealId = rows[0].id;
  const linked = await sql`
    UPDATE support_messages
    SET appeal_id = ${appealId}
    WHERE conversation_key = ${conversationKey}
      AND appeal_id IS NULL
      AND created_at >= '2026-06-17'::timestamptz
      AND created_at < '2026-06-25'::timestamptz
    RETURNING id`;

  await sql`
    UPDATE courier_profiles
    SET total_appeals = total_appeals + 1,
        last_appeal_at = GREATEST(COALESCE(last_appeal_at, ${item.createdAt}::timestamptz), ${item.createdAt}::timestamptz),
        last_name = COALESCE(last_name, ${item.lastName}),
        phone = COALESCE(phone, ${item.phone}),
        phone_model = COALESCE(phone_model, ${item.phoneModel}),
        updated_at = now()
    WHERE max_user_id = ${item.maxUserId}`;

  results.push({
    action: "created",
    appealNumber: rows[0].appeal_number,
    user: item.maxUserId,
    linkedMessages: linked.length,
  });
}

// Цурупа: привязать follow-up к обращению №7 и открыть снова
const appeal7 = await sql`
  SELECT id, appeal_number, status FROM support_appeals WHERE appeal_number = 7 LIMIT 1`;
if (appeal7.length > 0 && !DRY_RUN) {
  const appealId = appeal7[0].id;
  const linked = await sql`
    UPDATE support_messages
    SET appeal_id = ${appealId}
    WHERE max_user_id = '226078887'
      AND appeal_id IS NULL
      AND direction = 'in'
      AND created_at >= '2026-06-17'::timestamptz
      AND created_at < '2026-06-25'::timestamptz
    RETURNING id`;
  if (appeal7[0].status === "closed") {
    await sql`
      UPDATE support_appeals
      SET status = 'open', closed_at = NULL, updated_at = now()
      WHERE id = ${appealId}`;
  }
  results.push({
    action: "relinked_appeal_7",
    linkedMessages: linked.length,
    reopened: appeal7[0].status === "closed",
  });
} else if (DRY_RUN && appeal7.length > 0) {
  results.push({ action: "would_relink_appeal_7" });
}

console.log(JSON.stringify({ dryRun: DRY_RUN, results }, null, 2));
await sql.end();
