import postgres from "postgres";

import { resolveIntakeSourceCode } from "@/lib/appeal-intake-sources";
import { resolveDeliveryPointFromText } from "@/lib/delivery-point-resolver";
import {
  ensureAppealsSchema,
  handleSupportGroupMessage,
  reconcileCourierAppealData,
  syncCourierProfilesFromAppeals,
} from "@/lib/appeals";
import { classifySupportText } from "@/lib/support-classifier";
import { getRuntimeEnv } from "@/lib/runtime-env";

let sqlClient: postgres.Sql | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    throw new Error("MONITOR_DATABASE_URL is not configured");
  }
  sqlClient ??= postgres(url, { max: 5 });
  return sqlClient;
}

export type AppealsSyncResult = {
  maxReplay: { processed: number; created: number; skipped: number; errors: number };
  orphanMessages: { linkedToAppeals: number; groups: number; appealsCreated: number; linked: number };
  courierReconcile: {
    clearedInternalPoints: number;
    reassignedPoints: number;
    adminMaxAppeals: number;
  };
  backfill: {
    classifications: number;
    intakeSources: number;
    phones: number;
    pointIds: number;
    employeePoints: number;
    employeesSynced: boolean;
  };
};

const maxApiBase = "https://platform-api.max.ru";

function extractIncidentText(issueText: string): string {
  const problemLine = issueText
    .split("\n")
    .find((line) => line.startsWith("Проблема:"))
    ?.replace(/^Проблема:\s*/, "")
    .trim();
  return problemLine || issueText.split("\n").filter(Boolean).slice(-1)[0]?.trim() || issueText.trim();
}

async function autoAssignAllAppealClassifications(limit = 5000): Promise<number> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT id, issue_text
    FROM support_appeals
    WHERE merged_into_id IS NULL
      AND coalesce(classification_source, 'auto') = 'auto'
      AND (
        classification IS NULL
        OR confidence IS NULL
        OR (classification = 'other' AND coalesce(confidence, 0) < 0.7)
      )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  let updated = 0;
  for (const row of rows) {
    const classification = classifySupportText(String(row.issue_text ?? ""));
    await sql()`
      UPDATE support_appeals
      SET classification = ${classification.category},
          category = ${classification.categoryLabel},
          subcategory = ${classification.subcategory},
          priority = ${classification.priority},
          confidence = ${classification.confidence},
          classification_source = 'auto',
          updated_at = now()
      WHERE id = ${String(row.id)}
    `;
    updated += 1;
  }
  return updated;
}

async function backfillIntakeSources(): Promise<number> {
  const rows = await sql()`
    SELECT id, source, intake_source_code
    FROM support_appeals
    WHERE merged_into_id IS NULL AND intake_source_code IS NULL
  `;
  let updated = 0;
  for (const row of rows) {
    const channel =
      row.source === "max" || row.source === "telegram" || row.source === "manual"
        ? row.source
        : "manual";
    const code = resolveIntakeSourceCode({ channel });
    await sql()`
      UPDATE support_appeals
      SET intake_source_code = ${code}, updated_at = now()
      WHERE id = ${String(row.id)}
    `;
    updated += 1;
  }
  return updated;
}

async function backfillEmployeePointIds(limit = 5000): Promise<number> {
  const rows = await sql()`
    SELECT e.max_user_id, e.notes, a.issue_text
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT issue_text
      FROM support_appeals
      WHERE max_user_id = e.max_user_id AND merged_into_id IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    ) a ON true
    WHERE e.point_id IS NULL
      AND (e.notes IS NOT NULL OR a.issue_text IS NOT NULL)
    LIMIT ${limit}
  `;

  let updated = 0;
  for (const row of rows) {
    const text = [String(row.notes ?? ""), extractIncidentText(String(row.issue_text ?? ""))]
      .filter(Boolean)
      .join("\n");
    if (!text.trim()) continue;
    const resolved = await resolveDeliveryPointFromText(text, null, { allowAi: false });
    if (!resolved || resolved.confidence < 0.65) continue;
    await sql()`
      UPDATE employees
      SET point_id = ${resolved.id}, updated_at = now()
      WHERE max_user_id = ${String(row.max_user_id)} AND point_id IS NULL
    `;
    updated += 1;
  }
  return updated;
}

async function loadAppealSearchText(appealId: string, issueText: string): Promise<string> {
  const messages = await sql()`
    SELECT text
    FROM support_messages
    WHERE appeal_id = ${appealId}
      AND direction = 'in'
      AND coalesce(trim(text), '') <> ''
    ORDER BY created_at ASC
    LIMIT 30
  `;
  return [issueText, ...messages.map((row) => String(row.text ?? ""))].filter(Boolean).join("\n");
}

async function backfillPhonesFromMessages(): Promise<number> {
  const rows = await sql()`
    SELECT DISTINCT ON (a.id)
      a.id,
      a.phone,
      sm.text
    FROM support_appeals a
    JOIN support_messages sm
      ON sm.max_user_id = a.max_user_id
     AND sm.direction = 'in'
     AND sm.appeal_id IS NOT NULL
    WHERE a.merged_into_id IS NULL
      AND (a.phone IS NULL OR trim(a.phone) = '' OR a.phone = 'не указан')
      AND sm.text ~ '[0-9]{10,}'
    ORDER BY a.id, sm.created_at DESC
  `;

  let updated = 0;
  for (const row of rows) {
    const match =
      String(row.text ?? "").match(/(?:\+7|8)?[\s(-]*(\d{3})[\s)-]*(\d{3})[\s-]*(\d{2})[\s-]*(\d{2})/) ??
      String(row.text ?? "").match(/(\d{11})/);
    if (!match) continue;
    const digits = match[0].replace(/\D/g, "");
    const phone =
      digits.length === 11 && digits.startsWith("8")
        ? `+7${digits.slice(1)}`
        : digits.length === 11 && digits.startsWith("7")
          ? `+${digits}`
          : digits.length === 10
            ? `+7${digits}`
            : null;
    if (!phone) continue;

    await sql()`
      UPDATE support_appeals
      SET phone = ${phone}, updated_at = now()
      WHERE id = ${String(row.id)}
        AND (phone IS NULL OR trim(phone) = '' OR phone = 'не указан')
    `;
    updated += 1;
  }
  return updated;
}

async function backfillPointIds(limit = 5000): Promise<number> {
  const rows = await sql()`
    SELECT a.id, a.issue_text, a.max_user_id, e.point_id AS profile_point_id
    FROM support_appeals a
    LEFT JOIN employees e ON e.max_user_id = a.max_user_id
    WHERE a.merged_into_id IS NULL
      AND a.point_id IS NULL
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;

  let updated = 0;
  for (const row of rows) {
    const text = await loadAppealSearchText(String(row.id), String(row.issue_text ?? ""));
    const resolved = await resolveDeliveryPointFromText(
      text,
      row.profile_point_id ? String(row.profile_point_id) : null,
      { allowAi: false },
    );
    const pointId =
      resolved && resolved.confidence >= 0.65
        ? resolved.id
        : row.profile_point_id
          ? String(row.profile_point_id)
          : null;
    if (!pointId) continue;

    await sql()`
      UPDATE support_appeals
      SET point_id = ${pointId}, updated_at = now()
      WHERE id = ${String(row.id)} AND point_id IS NULL
    `;

    if (row.max_user_id && resolved && resolved.confidence >= 0.8) {
      await sql()`
        UPDATE employees
        SET point_id = ${resolved.id}, updated_at = now()
        WHERE max_user_id = ${String(row.max_user_id)}
          AND (point_id IS NULL OR point_id <> ${resolved.id})
      `;
    }
    updated += 1;
  }
  return updated;
}

type MaxMessage = {
  body?: { mid?: string; text?: string; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
  recipient?: { chat_id?: string | number; chat_type?: string };
  sender?: {
    user_id?: string | number;
    first_name?: string;
    last_name?: string;
    name?: string;
    is_bot?: boolean;
  };
  timestamp?: number;
};

async function fetchMaxMessages(chatId: string, token: string, from?: number): Promise<MaxMessage[]> {
  const url = new URL(`${maxApiBase}/messages`);
  url.searchParams.set("chat_id", chatId);
  url.searchParams.set("count", "100");
  if (from != null) url.searchParams.set("from", String(from));

  const response = await fetch(url, {
    headers: { Authorization: token },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`MAX messages failed: ${response.status}: ${details.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { messages?: MaxMessage[] };
  return payload.messages ?? [];
}

function parseMaxPhoto(message: MaxMessage): string | null {
  for (const attachment of message.body?.attachments ?? []) {
    if (attachment.type === "image" && attachment.payload?.url) {
      return attachment.payload.url;
    }
  }
  return null;
}

async function resolveMaxChatIds(): Promise<string[]> {
  const fromEnv = (getRuntimeEnv("MAX_SUPPORT_CHAT_IDS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  const rows = await sql()`
    SELECT DISTINCT max_chat_id
    FROM support_appeals
    WHERE max_chat_id IS NOT NULL AND trim(max_chat_id) <> ''
    UNION
    SELECT DISTINCT max_chat_id
    FROM support_messages
    WHERE max_chat_id IS NOT NULL
      AND trim(max_chat_id) <> ''
      AND max_chat_id NOT LIKE 'tg:%'
  `;
  return rows.map((row) => String(row.max_chat_id)).filter(Boolean);
}

async function isMessageAlreadyStored(messageId: string | null): Promise<boolean> {
  if (!messageId) return false;
  const rows = await sql()`
    SELECT 1
    FROM support_appeals
    WHERE max_message_id = ${messageId}
    UNION ALL
    SELECT 1
    FROM support_messages
    WHERE max_message_id = ${messageId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function replayMaxChats(dryRun = false): Promise<AppealsSyncResult["maxReplay"]> {
  const token = getRuntimeEnv("MAX_BOT_TOKEN");
  const chatIds = await resolveMaxChatIds();

  const stats = { processed: 0, created: 0, skipped: 0, errors: 0 };
  if (!token || chatIds.length === 0) return stats;

  for (const chatId of chatIds) {
    let from: number | undefined;
    for (let page = 0; page < 50; page += 1) {
      let messages: MaxMessage[];
      try {
        messages = await fetchMaxMessages(chatId, token, from);
      } catch (error) {
        stats.errors += 1;
        break;
      }
      if (messages.length === 0) break;

      const sorted = [...messages].sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      );

      for (const message of sorted) {
        stats.processed += 1;
        const text = (message.body?.text ?? "").trim();
        const photoUrl = parseMaxPhoto(message);
        const userId = message.sender?.user_id != null ? String(message.sender.user_id) : null;
        if (!userId || message.sender?.is_bot) {
          stats.skipped += 1;
          continue;
        }
        if (!text && !photoUrl) {
          stats.skipped += 1;
          continue;
        }

        const messageId = message.body?.mid ? String(message.body.mid) : null;
        if (await isMessageAlreadyStored(messageId)) {
          stats.skipped += 1;
          continue;
        }

        if (dryRun) continue;

        try {
          const result = await handleSupportGroupMessage({
            chatId,
            userId,
            messageId,
            senderName: message.sender?.name ?? message.sender?.first_name ?? null,
            senderLastName: message.sender?.last_name ?? null,
            text,
            photoUrl,
            isBot: false,
          });
          if (result.action === "created") stats.created += 1;
          else stats.skipped += 1;
        } catch {
          stats.errors += 1;
        }
      }

      const lastTimestamp = sorted.at(-1)?.timestamp;
      if (lastTimestamp == null || messages.length < 100) break;
      from = lastTimestamp + 1;
    }
  }

  return stats;
}

async function linkOrphanMessagesToAppeals(dryRun = false): Promise<number> {
  if (dryRun) {
    const rows = await sql()`
      SELECT count(*)::int AS c
      FROM support_messages sm
      WHERE sm.appeal_id IS NULL
        AND sm.direction = 'in'
        AND sm.max_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM support_appeals a
          WHERE a.max_user_id = sm.max_user_id
            AND a.merged_into_id IS NULL
        )
    `;
    return Number(rows[0]?.c ?? 0);
  }

  const linked = await sql()`
    UPDATE support_messages sm
    SET appeal_id = latest.appeal_id
    FROM (
      SELECT DISTINCT ON (sm2.id)
        sm2.id AS message_id,
        a.id AS appeal_id
      FROM support_messages sm2
      JOIN support_appeals a
        ON a.max_user_id = sm2.max_user_id
       AND a.merged_into_id IS NULL
      WHERE sm2.appeal_id IS NULL
        AND sm2.direction = 'in'
        AND sm2.max_user_id IS NOT NULL
      ORDER BY sm2.id, a.created_at DESC
    ) latest
    WHERE sm.id = latest.message_id
      AND sm.appeal_id IS NULL
    RETURNING sm.id
  `;
  return linked.length;
}

async function createAppealsFromOrphanMessages(dryRun = false): Promise<AppealsSyncResult["orphanMessages"]> {
  const { shouldRegisterSupportAppeal } = await import("@/lib/support-classifier");

  const groups = await sql()`
    SELECT
      conversation_key,
      max(max_chat_id) AS chat_id,
      max(max_user_id) AS user_id,
      count(*)::int AS msg_count
    FROM support_messages
    WHERE appeal_id IS NULL
      AND direction = 'in'
      AND max_user_id IS NOT NULL
    GROUP BY conversation_key
    ORDER BY min(created_at) ASC
  `;

  const stats = { linkedToAppeals: 0, groups: groups.length, appealsCreated: 0, linked: 0 };
  if (groups.length === 0) return stats;

  for (const group of groups) {
    const messages = await sql()`
      SELECT id, max_chat_id, max_user_id, max_message_id, text, photo_url, created_at
      FROM support_messages
      WHERE conversation_key = ${String(group.conversation_key)}
        AND appeal_id IS NULL
        AND direction = 'in'
      ORDER BY created_at ASC
    `;

    const trigger = messages.find((row) =>
      shouldRegisterSupportAppeal(String(row.text ?? ""), Boolean(row.photo_url)),
    );
    if (!trigger) continue;

    if (dryRun) {
      stats.appealsCreated += 1;
      stats.linked += messages.length;
      continue;
    }

    const source = String(group.conversation_key).startsWith("tg:") ? "telegram" : "max";
    const userId = String(trigger.max_user_id ?? group.user_id);
    const chatId = String(trigger.max_chat_id ?? group.chat_id ?? "");
    const text = String(trigger.text ?? "").trim() || (trigger.photo_url ? "Приложено фото без текста" : "");
    const classification = classifySupportText(text);
    const intakeSourceCode = resolveIntakeSourceCode({
      channel: source === "telegram" ? "telegram" : "max",
    });
    const resolved = await resolveDeliveryPointFromText(text, null, { allowAi: false });
    const pointId = resolved && resolved.confidence >= 0.65 ? resolved.id : null;

    const issueText = [
      `Категория: ${classification.categoryLabel}`,
      `Подкатегория: ${classification.subcategory}`,
      "",
      `Проблема: ${text}`,
      trigger.photo_url ? `\nФото: ${trigger.photo_url}` : "",
      "\n[восстановлено из истории чата]",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const inserted = await sql()`
      INSERT INTO support_appeals (
        source, status, max_chat_id, max_user_id, max_message_id, sender_name,
        description_normalized, category, classification, subcategory, priority,
        confidence, classification_source, issue_text, photo_url, point_id,
        intake_source_code, created_at, updated_at
      )
      VALUES (
        ${source}, 'open', ${chatId || null}, ${userId}, ${trigger.max_message_id ? String(trigger.max_message_id) : null},
        null, ${text.toLowerCase().slice(0, 500)}, ${classification.categoryLabel},
        ${classification.category}, ${classification.subcategory}, ${classification.priority},
        ${classification.confidence}, 'auto', ${issueText}, ${trigger.photo_url ? String(trigger.photo_url) : null},
        ${pointId}, ${intakeSourceCode}, ${trigger.created_at}, now()
      )
      RETURNING id, appeal_number
    `;

    const appealId = String(inserted[0].id);
    const linked = await sql()`
      UPDATE support_messages
      SET appeal_id = ${appealId}
      WHERE conversation_key = ${String(group.conversation_key)}
        AND appeal_id IS NULL
      RETURNING id
    `;

    stats.appealsCreated += 1;
    stats.linked += linked.length;
  }

  return stats;
}

export async function syncAllAppealsData(options?: {
  dryRun?: boolean;
  skipMaxReplay?: boolean;
  skipOrphans?: boolean;
}): Promise<AppealsSyncResult> {
  await ensureAppealsSchema();

  const dryRun = options?.dryRun ?? false;

  const maxReplay = options?.skipMaxReplay
    ? { processed: 0, created: 0, skipped: 0, errors: 0 }
    : await replayMaxChats(dryRun);

  let linkedToAppeals = 0;
  let orphanMessages: AppealsSyncResult["orphanMessages"] = {
    linkedToAppeals: 0,
    groups: 0,
    appealsCreated: 0,
    linked: 0,
  };

  if (!options?.skipOrphans) {
    linkedToAppeals = await linkOrphanMessagesToAppeals(dryRun);
    orphanMessages = await createAppealsFromOrphanMessages(dryRun);
    orphanMessages.linkedToAppeals = linkedToAppeals;
  }

  let classifications = 0;
  let intakeSources = 0;
  let phones = 0;
  let pointIds = 0;
  let employeePoints = 0;
  let employeesSynced = false;
  let courierReconcile = { clearedInternalPoints: 0, reassignedPoints: 0, adminMaxAppeals: 0 };

  if (!dryRun) {
    courierReconcile = await reconcileCourierAppealData();
    classifications = await autoAssignAllAppealClassifications();
    intakeSources = await backfillIntakeSources();
    phones = await backfillPhonesFromMessages();
    employeePoints = await backfillEmployeePointIds();
    pointIds = await backfillPointIds();
    await syncCourierProfilesFromAppeals();
    employeesSynced = true;
  }

  return {
    maxReplay,
    orphanMessages,
    courierReconcile,
    backfill: { classifications, intakeSources, phones, pointIds, employeePoints, employeesSynced },
  };
}
