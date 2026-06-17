import postgres from "postgres";
import type { MaxInlineKeyboard } from "@/lib/max-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { suggestSupportReply } from "@/lib/support-ai";
import {
  ensureSupportLearningSchema,
  ingestOperatorReply,
  ingestPhotoPattern,
  ingestSuccessfulAutoReply,
  saveAppealPhotoAnalysis,
  type LearningAppealInput,
} from "@/lib/support-learning";
import {
  buildClassificationFromCategory,
  classifySupportText,
  normalizeSupportText,
  shouldStartSupportDialog,
  type SupportCategory,
  type SupportClassification,
  type SupportPriority,
  type SupportRequiredField,
  type ClassificationSource,
} from "@/lib/support-classifier";

export type AppealStatus = "open" | "in_progress" | "closed";

export type CourierProfile = {
  id: string;
  maxUserId: string;
  displayName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneModel: string | null;
  os: string | null;
  appVersion: string | null;
  notes: string | null;
  tags: string[];
  totalAppeals: number;
  lastAppealAt: string | null;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  appealId: string | null;
  direction: "in" | "bot" | "operator" | "ai" | "system";
  maxMessageId: string | null;
  maxUserId: string | null;
  text: string;
  photoUrl: string | null;
  createdAt: string;
};

export type Appeal = {
  id: string;
  appealNumber: number;
  source: string;
  status: AppealStatus;
  maxChatId: string | null;
  maxUserId: string | null;
  senderName: string | null;
  courierLastName: string | null;
  phone: string | null;
  phoneModel: string | null;
  os: string | null;
  appVersion: string | null;
  photoUrl: string | null;
  photoAnalysis: string | null;
  category: string | null;
  classification: string | null;
  subcategory: string | null;
  classificationSource: ClassificationSource | null;
  priority: SupportPriority | null;
  confidence: number | null;
  orderNumber: string | null;
  issueText: string;
  aiSummary: string | null;
  aiSuggestedReply: string | null;
  operatorReply: string | null;
  duplicateOf: number | null;
  resultText: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  courierProfile: CourierProfile | null;
  messages: SupportMessage[];
};

export type AppealAnalyticsRow = {
  label: string;
  total: number;
  closed: number;
  open: number;
  avgCloseHours: number | null;
};

export type AppealsTableMetric = {
  key: string;
  label: string;
  values: Record<string, number | string>;
};

export type AppealsAnalyticsReport = {
  weeks: string[];
  categoryRows: AppealsTableMetric[];
  userRows: AppealsTableMetric[];
  qualityRows: AppealsTableMetric[];
};

export type SupportMessageInput = {
  chatId: string;
  userId: string | null;
  messageId: string | null;
  senderName: string | null;
  senderLastName: string | null;
  text: string;
  photoUrl: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  contactVerified?: boolean;
  isBot?: boolean;
};

export type SupportMessageResult = {
  action: "ignored" | "prompt" | "created" | "duplicate" | "skipped";
  reply: string | null;
  keyboard?: MaxInlineKeyboard;
  appealNumber?: number;
  autoResolved?: boolean;
};

type DialogState =
  | "phone"
  | "lastName"
  | "description"
  | "photoUrl"
  | "phoneModel"
  | "appVersion"
  | "os"
  | "location"
  | "carrier";

type AppealDraft = {
  phone?: string;
  lastName?: string;
  description?: string;
  photoUrl?: string;
  phoneModel?: string;
  appVersion?: string;
  os?: string;
  location?: string;
  carrier?: string;
  messageId?: string;
  senderName?: string;
  classification?: SupportClassification;
};

let sqlClient: postgres.Sql | null = null;
let schemaReady: Promise<void> | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    throw new Error("MONITOR_DATABASE_URL is not configured");
  }
  sqlClient ??= postgres(url, { max: 5 });
  return sqlClient;
}

export async function ensureAppealsSchema() {
  schemaReady ??= migrateAppealsSchema().catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

async function migrateAppealsSchema() {
  await sql()`SELECT pg_advisory_lock(91020260616)`;
  try {
  await sql()`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql()`
    CREATE TABLE IF NOT EXISTS courier_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      max_user_id text UNIQUE NOT NULL,
      display_name text,
      last_name text,
      phone text,
      phone_model text,
      os text,
      app_version text,
      notes text,
      tags text[] NOT NULL DEFAULT '{}',
      total_appeals integer NOT NULL DEFAULT 0,
      last_appeal_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS support_appeals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appeal_number serial UNIQUE,
      source text NOT NULL DEFAULT 'max',
      status text NOT NULL DEFAULT 'open',
      max_chat_id text,
      max_user_id text,
      max_message_id text,
      sender_name text,
      courier_last_name text,
      phone text,
      phone_model text,
      os text,
      app_version text,
      photo_url text,
      description_normalized text,
      category text,
      classification text,
      subcategory text,
      priority text,
      confidence double precision,
      order_number text,
      issue_text text NOT NULL,
      ai_summary text,
      ai_suggested_reply text,
      operator_reply text,
      duplicate_of integer,
      result_text text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz
    )
  `;
  await addColumns("support_appeals", [
    ["appeal_number", "serial"],
    ["sender_name", "text"],
    ["courier_last_name", "text"],
    ["phone", "text"],
    ["phone_model", "text"],
    ["os", "text"],
    ["app_version", "text"],
    ["photo_url", "text"],
    ["description_normalized", "text"],
    ["classification", "text"],
    ["subcategory", "text"],
    ["priority", "text"],
    ["confidence", "double precision"],
    ["classification_source", "text"],
    ["ai_summary", "text"],
    ["ai_suggested_reply", "text"],
    ["operator_reply", "text"],
    ["duplicate_of", "integer"],
  ]);
  await addColumns("courier_profiles", [
    ["display_name", "text"],
    ["last_name", "text"],
    ["phone", "text"],
    ["phone_model", "text"],
    ["os", "text"],
    ["app_version", "text"],
    ["notes", "text"],
    ["tags", "text[] NOT NULL DEFAULT '{}'"],
    ["total_appeals", "integer NOT NULL DEFAULT 0"],
    ["last_appeal_at", "timestamptz"],
    ["updated_at", "timestamptz NOT NULL DEFAULT now()"],
  ]);
  await sql()`
    CREATE TABLE IF NOT EXISTS support_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      appeal_id uuid REFERENCES support_appeals(id) ON DELETE SET NULL,
      conversation_key text,
      direction text NOT NULL,
      max_chat_id text,
      max_user_id text,
      max_message_id text,
      text text NOT NULL DEFAULT '',
      photo_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS max_support_dialogs (
      conversation_key text PRIMARY KEY,
      chat_id text NOT NULL,
      user_id text,
      state text NOT NULL DEFAULT 'idle',
      draft jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE UNIQUE INDEX IF NOT EXISTS support_appeals_max_message_id_key
    ON support_appeals (max_message_id)
    WHERE max_message_id IS NOT NULL
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS support_appeals_user_status_created_idx
    ON support_appeals (max_user_id, status, created_at DESC)
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS support_messages_appeal_created_idx
    ON support_messages (appeal_id, created_at)
  `;
  await ensureSupportLearningSchema();
  await addColumns("support_appeals", [["photo_analysis", "text"]]);
  } finally {
    await sql()`SELECT pg_advisory_unlock(91020260616)`;
  }
}

async function addColumns(table: string, columns: Array<[string, string]>) {
  for (const [name, type] of columns) {
    await sql().unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
}

export async function syncCourierProfilesFromAppeals() {
  await ensureAppealsSchema();
  await sql()`
    UPDATE support_appeals
    SET classification = 'mobile_app',
        category = 'Мобильное приложение',
        classification_source = coalesce(classification_source, 'auto')
    WHERE classification IS NULL
      AND lower(trim(category)) IN ('приложение', 'мобильное приложение')
  `;
  await sql()`
    INSERT INTO courier_profiles (
      max_user_id,
      display_name,
      last_name,
      phone,
      phone_model,
      os,
      app_version,
      total_appeals,
      last_appeal_at,
      updated_at
    )
    SELECT
      max_user_id,
      max(sender_name) FILTER (WHERE sender_name IS NOT NULL),
      max(courier_last_name) FILTER (WHERE courier_last_name IS NOT NULL),
      max(phone) FILTER (WHERE phone IS NOT NULL),
      max(phone_model) FILTER (WHERE phone_model IS NOT NULL),
      max(os) FILTER (WHERE os IS NOT NULL),
      max(app_version) FILTER (WHERE app_version IS NOT NULL),
      count(*)::int,
      max(created_at),
      now()
    FROM support_appeals
    WHERE max_user_id IS NOT NULL
    GROUP BY max_user_id
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(courier_profiles.display_name, EXCLUDED.display_name),
        last_name = COALESCE(courier_profiles.last_name, EXCLUDED.last_name),
        phone = COALESCE(courier_profiles.phone, EXCLUDED.phone),
        phone_model = COALESCE(courier_profiles.phone_model, EXCLUDED.phone_model),
        os = COALESCE(courier_profiles.os, EXCLUDED.os),
        app_version = COALESCE(courier_profiles.app_version, EXCLUDED.app_version),
        total_appeals = GREATEST(courier_profiles.total_appeals, EXCLUDED.total_appeals),
        last_appeal_at = GREATEST(
          COALESCE(courier_profiles.last_appeal_at, '-infinity'::timestamptz),
          COALESCE(EXCLUDED.last_appeal_at, '-infinity'::timestamptz)
        ),
        updated_at = now()
  `;
  await sql()`
    INSERT INTO courier_profiles (
      max_user_id,
      display_name,
      last_name,
      phone,
      phone_model,
      os,
      app_version,
      total_appeals,
      last_appeal_at,
      updated_at
    )
    SELECT
      'phone:' || regexp_replace(phone, '[^0-9+]', '', 'g'),
      max(sender_name) FILTER (WHERE sender_name IS NOT NULL),
      max(courier_last_name) FILTER (WHERE courier_last_name IS NOT NULL),
      max(phone) FILTER (WHERE phone IS NOT NULL),
      max(phone_model) FILTER (WHERE phone_model IS NOT NULL),
      max(os) FILTER (WHERE os IS NOT NULL),
      max(app_version) FILTER (WHERE app_version IS NOT NULL),
      count(*)::int,
      max(created_at),
      now()
    FROM support_appeals
    WHERE max_user_id IS NULL
      AND phone IS NOT NULL
      AND trim(phone) <> ''
    GROUP BY regexp_replace(phone, '[^0-9+]', '', 'g')
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(courier_profiles.display_name, EXCLUDED.display_name),
        last_name = COALESCE(courier_profiles.last_name, EXCLUDED.last_name),
        phone = COALESCE(courier_profiles.phone, EXCLUDED.phone),
        phone_model = COALESCE(courier_profiles.phone_model, EXCLUDED.phone_model),
        os = COALESCE(courier_profiles.os, EXCLUDED.os),
        app_version = COALESCE(courier_profiles.app_version, EXCLUDED.app_version),
        total_appeals = GREATEST(courier_profiles.total_appeals, EXCLUDED.total_appeals),
        last_appeal_at = GREATEST(
          COALESCE(courier_profiles.last_appeal_at, '-infinity'::timestamptz),
          COALESCE(EXCLUDED.last_appeal_at, '-infinity'::timestamptz)
        ),
        updated_at = now()
  `;
}

async function autoAssignAppealClassifications() {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT id, issue_text
    FROM support_appeals
    WHERE coalesce(classification_source, 'auto') = 'auto'
      AND (
        classification IS NULL
        OR confidence IS NULL
        OR (classification = 'other' AND coalesce(confidence, 0) < 0.7)
      )
    ORDER BY created_at DESC
    LIMIT 200
  `;

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
  }
}

export async function updateAppealClassification(
  id: string,
  category: SupportCategory,
): Promise<Appeal | null> {
  await ensureAppealsSchema();
  const appeal = await getAppeal(id);
  if (!appeal) return null;

  const classification = buildClassificationFromCategory(category);
  const issueText = patchIssueTextCategory(appeal.issueText, classification);

  await sql()`
    UPDATE support_appeals
    SET classification = ${classification.category},
        category = ${classification.categoryLabel},
        subcategory = ${classification.subcategory},
        priority = ${classification.priority},
        confidence = 1,
        classification_source = 'operator',
        issue_text = ${issueText},
        updated_at = now()
    WHERE id = ${id}
  `;

  return getAppeal(id);
}

function patchIssueTextCategory(issueText: string, classification: SupportClassification) {
  const lines = issueText.split("\n");
  let hasCategory = false;
  let hasSubcategory = false;
  const next = lines.map((line) => {
    if (line.startsWith("Категория:")) {
      hasCategory = true;
      return `Категория: ${classification.categoryLabel}`;
    }
    if (line.startsWith("Подкатегория:")) {
      hasSubcategory = true;
      return `Подкатегория: ${classification.subcategory}`;
    }
    return line;
  });

  const prefix: string[] = [];
  if (!hasCategory) prefix.push(`Категория: ${classification.categoryLabel}`);
  if (!hasSubcategory) prefix.push(`Подкатегория: ${classification.subcategory}`);
  if (prefix.length === 0) return next.join("\n");
  return [...prefix, "", ...next].join("\n").trim();
}

export async function listCourierProfiles(search?: string): Promise<CourierProfile[]> {
  await ensureAppealsSchema();
  await syncCourierProfilesFromAppeals();
  const query = search?.trim();
  const rows = query
    ? await sql()`
        SELECT *
        FROM courier_profiles
        WHERE
          coalesce(last_name, '') ILIKE ${`%${query}%`}
          OR coalesce(display_name, '') ILIKE ${`%${query}%`}
          OR coalesce(phone, '') ILIKE ${`%${query}%`}
          OR max_user_id ILIKE ${`%${query}%`}
        ORDER BY coalesce(last_appeal_at, updated_at) DESC
        LIMIT 300
      `
    : await sql()`
        SELECT *
        FROM courier_profiles
        ORDER BY coalesce(last_appeal_at, updated_at) DESC
        LIMIT 300
      `;
  return rows.map(toCourierProfile);
}

export async function getCourierProfile(id: string): Promise<CourierProfile | null> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT *
    FROM courier_profiles
    WHERE id = ${id} OR max_user_id = ${id}
    LIMIT 1
  `;
  return rows[0] ? toCourierProfile(rows[0]) : null;
}

export async function getCourierProfileByMaxOrPhone(
  maxUserId: string,
  phone?: string | null,
): Promise<CourierProfile | null> {
  await ensureAppealsSchema();
  await syncCourierProfilesFromAppeals();
  const normalizedPhone = phone ? normalizePhoneForStorage(phone) : null;
  const rows = await sql()`
    SELECT *
    FROM courier_profiles
    WHERE max_user_id = ${maxUserId}
       OR (${normalizedPhone}::text IS NOT NULL AND phone = ${normalizedPhone})
    ORDER BY CASE WHEN max_user_id = ${maxUserId} THEN 0 ELSE 1 END
    LIMIT 1
  `;
  return rows[0] ? toCourierProfile(rows[0]) : null;
}

export async function listCourierAppealsForBot(
  maxUserId: string,
  phone?: string | null,
  limit = 5,
): Promise<Appeal[]> {
  await ensureAppealsSchema();
  const normalizedPhone = phone ? normalizePhoneForStorage(phone) : null;
  const rows = await sql()`
    SELECT a.*, row_to_json(cp.*) AS courier_profile
    FROM support_appeals a
    LEFT JOIN LATERAL (
      SELECT cp.*
      FROM courier_profiles cp
      WHERE
        (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
        OR (a.phone IS NOT NULL AND cp.phone = a.phone)
      ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
      LIMIT 1
    ) cp ON TRUE
    WHERE a.max_user_id = ${maxUserId}
       OR (${normalizedPhone}::text IS NOT NULL AND a.phone = ${normalizedPhone})
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toAppeal);
}

export async function listAppeals(status?: string): Promise<Appeal[]> {
  await ensureAppealsSchema();
  await syncCourierProfilesFromAppeals();
  await autoAssignAppealClassifications();
  const rows =
    status && status !== "all"
      ? await sql()`
          SELECT a.*, row_to_json(cp.*) AS courier_profile
          FROM support_appeals a
          LEFT JOIN LATERAL (
            SELECT cp.*
            FROM courier_profiles cp
            WHERE
              (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
              OR (a.phone IS NOT NULL AND cp.phone = a.phone)
            ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
            LIMIT 1
          ) cp ON TRUE
          WHERE a.status = ${status}
          ORDER BY a.created_at DESC
          LIMIT 200
        `
      : await sql()`
          SELECT a.*, row_to_json(cp.*) AS courier_profile
          FROM support_appeals a
          LEFT JOIN LATERAL (
            SELECT cp.*
            FROM courier_profiles cp
            WHERE
              (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
              OR (a.phone IS NOT NULL AND cp.phone = a.phone)
            ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
            LIMIT 1
          ) cp ON TRUE
          ORDER BY a.created_at DESC
          LIMIT 200
        `;
  const appeals = rows.map(toAppeal);
  await attachMessages(appeals);
  return appeals;
}

export async function getAppeal(id: string): Promise<Appeal | null> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT a.*, row_to_json(cp.*) AS courier_profile
    FROM support_appeals a
    LEFT JOIN LATERAL (
      SELECT cp.*
      FROM courier_profiles cp
      WHERE
        (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
        OR (a.phone IS NOT NULL AND cp.phone = a.phone)
      ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
      LIMIT 1
    ) cp ON TRUE
    WHERE a.id = ${id}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const appeal = toAppeal(rows[0]);
  await attachMessages([appeal]);
  return appeal;
}

async function attachMessages(appeals: Appeal[]) {
  const ids = appeals.map((appeal) => appeal.id);
  if (ids.length === 0) return;
  const rows = await sql()`
    SELECT *
    FROM support_messages
    WHERE appeal_id = ANY(${ids})
    ORDER BY created_at ASC
  `;
  const byAppeal = new Map<string, SupportMessage[]>();
  for (const row of rows) {
    const appealId = nullableString(row.appeal_id);
    if (!appealId) continue;
    const list = byAppeal.get(appealId) ?? [];
    list.push(toSupportMessage(row));
    byAppeal.set(appealId, list);
  }
  for (const appeal of appeals) {
    appeal.messages = byAppeal.get(appeal.id) ?? [];
  }
}

export async function closeAppeal(id: string, resultText: string) {
  await ensureAppealsSchema();
  const before = await getAppeal(id);
  const rows = await sql()`
    UPDATE support_appeals
    SET status = 'closed',
        result_text = ${resultText},
        closed_at = now(),
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const appeal = rows[0] ? toAppeal(rows[0]) : null;
  if (appeal && resultText.trim().length >= 12 && before?.operatorReply !== resultText) {
    await ingestOperatorReply(toLearningInput(appeal), resultText);
  }
  return appeal;
}

export async function addOperatorReply(id: string, text: string) {
  await ensureAppealsSchema();
  const appeal = await getAppeal(id);
  if (!appeal) return null;
  await appendMessage({
    appealId: id,
    conversationKey:
      appeal.maxChatId && appeal.maxUserId ? `${appeal.maxChatId}:${appeal.maxUserId}` : null,
    direction: "operator",
    maxChatId: appeal.maxChatId,
    maxUserId: appeal.maxUserId,
    maxMessageId: null,
    text,
    photoUrl: null,
  });
  await sql()`
    UPDATE support_appeals
    SET operator_reply = ${text}, updated_at = now()
    WHERE id = ${id}
  `;
  await ingestOperatorReply(toLearningInput(appeal), text);
  return appeal;
}

export async function updateCourierProfile(
  maxUserId: string,
  input: Partial<
    Pick<
      CourierProfile,
      | "displayName"
      | "lastName"
      | "phone"
      | "phoneModel"
      | "os"
      | "appVersion"
      | "notes"
      | "tags"
    >
  >,
) {
  await ensureAppealsSchema();
  const rows = await sql()`
    INSERT INTO courier_profiles (
      max_user_id,
      display_name,
      last_name,
      phone,
      phone_model,
      os,
      app_version,
      notes,
      tags,
      updated_at
    )
    VALUES (
      ${maxUserId},
      ${input.displayName ?? null},
      ${input.lastName ?? null},
      ${input.phone ?? null},
      ${input.phoneModel ?? null},
      ${input.os ?? null},
      ${input.appVersion ?? null},
      ${input.notes ?? null},
      ${input.tags ?? []},
      now()
    )
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, courier_profiles.display_name),
        last_name = COALESCE(EXCLUDED.last_name, courier_profiles.last_name),
        phone = COALESCE(EXCLUDED.phone, courier_profiles.phone),
        phone_model = COALESCE(EXCLUDED.phone_model, courier_profiles.phone_model),
        os = COALESCE(EXCLUDED.os, courier_profiles.os),
        app_version = COALESCE(EXCLUDED.app_version, courier_profiles.app_version),
        notes = COALESCE(EXCLUDED.notes, courier_profiles.notes),
        tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE courier_profiles.tags END,
        updated_at = now()
    RETURNING *
  `;
  return toCourierProfile(rows[0]);
}

export async function suggestReplyForAppeal(id: string) {
  const appeal = await getAppeal(id);
  if (!appeal) return null;
  const classification = classifySupportText(appeal.issueText);
  const suggestion = await suggestSupportReply({
    description: appeal.issueText,
    classification,
    courier: appeal.courierProfile ?? {
      lastName: appeal.courierLastName,
      phone: appeal.phone,
      phoneModel: appeal.phoneModel,
      appVersion: appeal.appVersion,
      os: appeal.os,
      notes: null,
    },
  });
  await sql()`
    UPDATE support_appeals
    SET ai_summary = ${suggestion.summary},
        ai_suggested_reply = ${suggestion.suggestedReply},
        updated_at = now()
    WHERE id = ${id}
  `;
  return suggestion;
}

export async function readAppealAnalytics(range?: {
  from?: string | null;
  to?: string | null;
}): Promise<AppealAnalyticsRow[]> {
  await ensureAppealsSchema();
  const { from, to } = resolveAnalyticsDateRange(range);
  const rows = await sql()`
    SELECT
      to_char(date_trunc('week', created_at), 'DD.MM') AS label,
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'closed')::int AS closed,
      count(*) FILTER (WHERE status <> 'closed')::int AS open,
      avg(extract(epoch from (closed_at - created_at)) / 3600)
        FILTER (WHERE closed_at IS NOT NULL) AS "avgCloseHours"
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
    GROUP BY date_trunc('week', created_at)
    ORDER BY date_trunc('week', created_at)
  `;
  return rows.map((row) => ({
    label: String(row.label),
    total: Number(row.total ?? 0),
    closed: Number(row.closed ?? 0),
    open: Number(row.open ?? 0),
    avgCloseHours:
      row.avgCloseHours == null ? null : Number(row.avgCloseHours),
  }));
}

export async function readAppealsAnalyticsReport(range?: {
  from?: string | null;
  to?: string | null;
}): Promise<AppealsAnalyticsReport> {
  await ensureAppealsSchema();
  const { from, to } = resolveAnalyticsDateRange(range);
  const weekRows = await sql()`
    SELECT DISTINCT to_char(date_trunc('week', created_at), 'DD.MM - ') ||
      to_char(date_trunc('week', created_at) + INTERVAL '6 days', 'DD.MM') AS label,
      date_trunc('week', created_at) AS week_start
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
    ORDER BY week_start
  `;
  const weeks = weekRows.map((row) => String(row.label));
  const categoryRows = await sql()`
    SELECT
      COALESCE(category, classification, 'Без категории') AS row_label,
      to_char(date_trunc('week', created_at), 'DD.MM - ') ||
        to_char(date_trunc('week', created_at) + INTERVAL '6 days', 'DD.MM') AS week_label,
      count(*)::int AS total
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
    GROUP BY row_label, date_trunc('week', created_at)
  `;
  const userRows = await sql()`
    SELECT
      COALESCE(courier_last_name, sender_name, max_user_id, 'Неизвестно') AS row_label,
      to_char(date_trunc('week', created_at), 'DD.MM - ') ||
        to_char(date_trunc('week', created_at) + INTERVAL '6 days', 'DD.MM') AS week_label,
      count(*)::int AS total
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
    GROUP BY row_label, date_trunc('week', created_at)
    ORDER BY count(*) DESC
    LIMIT 80
  `;
  const qualityRows = await sql()`
    SELECT
      to_char(date_trunc('week', created_at), 'DD.MM - ') ||
        to_char(date_trunc('week', created_at) + INTERVAL '6 days', 'DD.MM') AS week_label,
      count(*)::int AS total,
      count(DISTINCT max_user_id)::int AS unique_users,
      count(*) FILTER (WHERE duplicate_of IS NOT NULL)::int AS duplicates,
      count(*) FILTER (WHERE status = 'closed')::int AS closed
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
    GROUP BY date_trunc('week', created_at)
  `;
  return {
    weeks,
    categoryRows: pivotRows(categoryRows, weeks),
    userRows: pivotRows(userRows, weeks),
    qualityRows: [
      metricFromQuality("total", "Количество обращений", qualityRows, weeks, "total"),
      metricFromQuality("unique", "Уникальные курьеры", qualityRows, weeks, "unique_users"),
      metricFromQuality("duplicates", "Повторные обращения", qualityRows, weeks, "duplicates"),
      metricFromQuality("closed", "Закрытые обращения", qualityRows, weeks, "closed"),
    ],
  };
}

export async function handleSupportGroupMessage(
  input: SupportMessageInput,
): Promise<SupportMessageResult> {
  await ensureAppealsSchema();
  if (input.isBot || isBotReplyText(input.text)) return { action: "skipped", reply: null };
  const allowedChatIds = getAllowedSupportChatIds();
  if (allowedChatIds.length > 0 && !allowedChatIds.includes(input.chatId)) {
    return { action: "skipped", reply: null };
  }
  if (!input.userId) return { action: "skipped", reply: null };

  const conversationKey = `${input.chatId}:${input.userId}`;
  await appendMessage({
    appealId: null,
    conversationKey,
    direction: "in",
    maxChatId: input.chatId,
    maxUserId: input.userId,
    maxMessageId: input.messageId,
    text: input.text,
    photoUrl: input.photoUrl,
  });

  const profile = await upsertCourierProfile(input.userId, {
    displayName: input.senderName,
    lastName: input.senderLastName,
  });
  const dialog = await getDialog(conversationKey);
  const activeState = dialog?.state ?? null;

  if (activeState) {
    if (shouldStartSupportDialog(input.text)) {
      await clearDialog(conversationKey);
      return startDialog(conversationKey, input, profile);
    }
    return continueDialog(conversationKey, activeState, dialog!.draft, input, profile);
  }
  if (!shouldStartSupportDialog(input.text)) return { action: "ignored", reply: null };
  return startDialog(conversationKey, input, profile);
}

export async function handleCourierBotMessage(
  input: SupportMessageInput,
): Promise<SupportMessageResult> {
  await ensureAppealsSchema();
  if (input.isBot || isBotReplyText(input.text)) return { action: "skipped", reply: null };
  if (!input.userId) return { action: "skipped", reply: null };

  const conversationKey = `${input.chatId}:${input.userId}`;
  await appendMessage({
    appealId: null,
    conversationKey,
    direction: "in",
    maxChatId: input.chatId,
    maxUserId: input.userId,
    maxMessageId: input.messageId,
    text: input.text || (input.contactPhone ? "[контакт MAX]" : ""),
    photoUrl: input.photoUrl,
  });

  let profile =
    (await getCourierProfileByMaxOrPhone(input.userId, input.contactPhone)) ??
    (await upsertCourierProfile(input.userId, {
      displayName: input.senderName,
      lastName: input.senderLastName,
    }));

  if (input.contactPhone) {
    if (!input.contactVerified) {
      return {
        action: "prompt",
        reply:
          "Не удалось подтвердить, что это номер из вашего аккаунта MAX. Нажмите кнопку «Передать мой телефон» в сообщении бота.",
        keyboard: requestContactKeyboard(),
      };
    }
    profile = await upsertCourierProfile(input.userId, {
      displayName: input.contactName ?? input.senderName ?? profile.displayName,
      lastName: input.senderLastName ?? profile.lastName,
      phone: input.contactPhone,
    });
  }

  const dialog = await getDialog(conversationKey);
  const text = input.text.trim();
  if (dialog?.state) {
    if (isPortalMenuCommand(text)) {
      await clearDialog(conversationKey);
      return renderCourierBotCard(input.userId, profile);
    }
    return continueDialog(conversationKey, dialog.state, dialog.draft, input, profile);
  }

  if (!profile.phone) {
    return {
      action: "prompt",
      reply:
        "Чтобы открыть личную карточку курьера, подтвердите номер телефона из вашего аккаунта MAX. Так нельзя указать чужой номер.",
      keyboard: requestContactKeyboard(),
    };
  }

  if (isCreateAppealCommand(text)) {
    return startDialog(
      conversationKey,
      { ...input, text: "создать обращение" },
      profile,
    );
  }

  if (isPortalMenuCommand(text) || !text) {
    return renderCourierBotCard(input.userId, profile);
  }

  return {
    action: "prompt",
    reply: "Выберите действие:",
    keyboard: courierPortalKeyboard(),
  };
}

async function startDialog(
  conversationKey: string,
  input: SupportMessageInput,
  profile: CourierProfile,
) {
  const classification = classifySupportText(input.text);
  const draft: AppealDraft = {
    senderName: input.senderName ?? undefined,
    messageId: input.messageId ?? undefined,
    phone: extractPhone(input.text) ?? profile.phone ?? undefined,
    lastName: input.senderLastName?.trim() || profile.lastName || undefined,
    description: extractDescriptionFromTrigger(input.text) ?? undefined,
    photoUrl: input.photoUrl ?? undefined,
    phoneModel: extractPhoneModel(input.text) ?? profile.phoneModel ?? undefined,
    appVersion: extractAppVersion(input.text) ?? profile.appVersion ?? undefined,
    os: extractOs(input.text) ?? profile.os ?? undefined,
    classification,
  };
  return advanceDialog(conversationKey, input, draft, profile);
}

async function continueDialog(
  conversationKey: string,
  state: DialogState,
  draft: AppealDraft,
  input: SupportMessageInput,
  profile: CourierProfile,
): Promise<SupportMessageResult> {
  const text = input.text.trim();
  if (state === "phone") {
    const phone = extractPhone(text);
    if (!phone) {
      return prompt(conversationKey, input, state, draft, "Укажите номер телефона в формате +7XXXXXXXXXX или 8XXXXXXXXXX.");
    }
    draft.phone = phone;
  } else if (state === "lastName") {
    const lastName = extractLastName(text);
    if (!lastName) return prompt(conversationKey, input, state, draft, "Укажите фамилию курьера.");
    draft.lastName = lastName;
  } else if (state === "description") {
    if (text.length < 8) {
      return prompt(conversationKey, input, state, draft, "Опишите проблему подробнее: что именно не работает?");
    }
    draft.description = text;
    draft.classification = classifySupportText(text);
  } else if (state === "photoUrl") {
    if (!input.photoUrl) return prompt(conversationKey, input, state, draft, "Приложите фото или скриншот проблемы.");
    draft.photoUrl = input.photoUrl;
  } else {
    draft[state] = text;
  }
  if (input.messageId) draft.messageId = input.messageId;
  return advanceDialog(conversationKey, input, draft, profile);
}

async function advanceDialog(
  conversationKey: string,
  input: SupportMessageInput,
  draft: AppealDraft,
  profile: CourierProfile,
): Promise<SupportMessageResult> {
  let classification = draft.classification ?? classifySupportText(draft.description ?? input.text);
  draft.classification = classification;
  const next = nextMissingField(draft, classification.requiredFields);
  if (next) return prompt(conversationKey, input, next, draft, promptForField(next, classification));

  const description = draft.description!.trim();
  classification = classifySupportText(
    [description, draft.phoneModel, draft.os, draft.appVersion, draft.lastName].filter(Boolean).join("\n"),
  );
  draft.classification = classification;

  const duplicateNumber = await findSimilarAppeal(input.userId!, description);
  if (duplicateNumber) {
    await clearDialog(conversationKey);
    return {
      action: "duplicate",
      appealNumber: duplicateNumber,
      reply: `Обращение №${duplicateNumber} с таким описанием уже зарегистрировано. Ожидайте ответа оператора.`,
    };
  }

  const messageDuplicate = draft.messageId ? await findAppealByMessageId(draft.messageId) : null;
  if (messageDuplicate) {
    await clearDialog(conversationKey);
    return { action: "duplicate", appealNumber: messageDuplicate, reply: `Обращение №${messageDuplicate} уже зарегистрировано.` };
  }

  await upsertCourierProfile(input.userId!, {
    displayName: input.senderName ?? profile.displayName,
    lastName: draft.lastName ?? profile.lastName,
    phone: draft.phone ?? profile.phone,
    phoneModel: draft.phoneModel ?? profile.phoneModel,
    os: draft.os ?? profile.os,
    appVersion: draft.appVersion ?? profile.appVersion,
  });
  const suggestion = await suggestSupportReply({
    description,
    classification,
    photoUrl: draft.photoUrl ?? input.photoUrl,
    courier: {
      lastName: draft.lastName ?? profile.lastName,
      phone: draft.phone ?? profile.phone,
      phoneModel: draft.phoneModel ?? profile.phoneModel,
      appVersion: draft.appVersion ?? profile.appVersion,
      os: draft.os ?? profile.os,
      notes: profile.notes,
    },
  });
  const autoResolved = suggestion.canAutoResolve;
  const rows = await sql()`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      courier_last_name, phone, phone_model, os, app_version, photo_url,
      photo_analysis, description_normalized, category, classification, subcategory, priority,
      confidence, classification_source, order_number, issue_text, ai_summary, ai_suggested_reply,
      operator_reply, result_text
    )
    VALUES (
      'max', ${autoResolved ? "closed" : "open"}, ${input.chatId}, ${input.userId}, ${draft.messageId ?? input.messageId},
      ${draft.senderName ?? input.senderName}, ${draft.lastName ?? null}, ${draft.phone ?? null},
      ${draft.phoneModel ?? null}, ${draft.os ?? null}, ${draft.appVersion ?? null},
      ${draft.photoUrl ?? null}, ${suggestion.photoAnalysis ?? null},
      ${normalizeSupportText(description)}, ${classification.categoryLabel},
      ${classification.category}, ${classification.subcategory}, ${classification.priority},
      ${classification.confidence}, 'auto', ${extractOrderNumber(description)}, ${formatIssueText(draft, classification)},
      ${suggestion.summary}, ${suggestion.suggestedReply},
      ${autoResolved ? suggestion.suggestedReply : null},
      ${autoResolved ? suggestion.suggestedReply : null}
    )
    RETURNING id, appeal_number
  `;
  const appealId = String(rows[0].id);
  if (suggestion.photoAnalysis) {
    await saveAppealPhotoAnalysis(appealId, suggestion.photoAnalysis);
  }
  const learningAppeal: LearningAppealInput = {
    id: appealId,
    classification: classification.category,
    category: classification.categoryLabel,
    subcategory: classification.subcategory,
    descriptionNormalized: normalizeSupportText(description),
    issueText: formatIssueText(draft, classification),
    phoneModel: draft.phoneModel ?? profile.phoneModel,
    os: draft.os ?? profile.os,
    appVersion: draft.appVersion ?? profile.appVersion,
    photoUrl: draft.photoUrl ?? input.photoUrl ?? null,
    photoAnalysis: suggestion.photoAnalysis ?? null,
  };
  if (suggestion.photoAnalysis) {
    await ingestPhotoPattern(learningAppeal, suggestion.photoAnalysis);
  }
  if (autoResolved) {
    await ingestSuccessfulAutoReply(learningAppeal, suggestion.suggestedReply);
  }
  if (autoResolved) {
    await sql()`
      UPDATE support_appeals
      SET closed_at = now(), updated_at = now()
      WHERE id = ${appealId}
    `;
  }
  await sql()`
    UPDATE support_messages
    SET appeal_id = ${appealId}
    WHERE conversation_key = ${conversationKey} AND appeal_id IS NULL
  `;
  await sql()`
    UPDATE courier_profiles
    SET total_appeals = total_appeals + 1, last_appeal_at = now(), updated_at = now()
    WHERE max_user_id = ${input.userId}
  `;
  await clearDialog(conversationKey);
  const appealNumber = Number(rows[0].appeal_number);
  const reply = autoResolved
    ? `Обращение №${appealNumber}.\n\n${suggestion.suggestedReply}`
    : `Обращение №${appealNumber} зарегистрировано. Оператор подключится и ответит в ближайшее время.`;
  await appendMessage({
    appealId,
    conversationKey,
    direction: autoResolved ? "ai" : "bot",
    maxChatId: input.chatId,
    maxUserId: input.userId,
    maxMessageId: null,
    text: reply,
    photoUrl: null,
  });
  return { action: "created", appealNumber, reply, autoResolved };
}

function prompt(
  conversationKey: string,
  input: SupportMessageInput,
  state: DialogState,
  draft: AppealDraft,
  reply: string,
): Promise<SupportMessageResult> {
  return saveDialog(conversationKey, input.chatId, input.userId!, state, draft).then(async () => {
    await appendMessage({
      appealId: null,
      conversationKey,
      direction: "bot",
      maxChatId: input.chatId,
      maxUserId: input.userId,
      maxMessageId: null,
      text: reply,
      photoUrl: null,
    });
    return { action: "prompt" as const, reply };
  });
}

async function renderCourierBotCard(
  maxUserId: string,
  profile: CourierProfile,
): Promise<SupportMessageResult> {
  const appeals = await listCourierAppealsForBot(maxUserId, profile.phone, 7);
  const lastAppeals = appeals.length
    ? appeals
        .map(
          (appeal) =>
            `№${appeal.appealNumber} · ${statusLabel(appeal.status)} · ${formatDateTime(appeal.createdAt)}\n${shorten(
              oneLine(appeal.issueText),
              90,
            )}`,
        )
        .join("\n\n")
    : "Обращений пока нет.";

  const lines = [
    "Личная карточка курьера",
    "",
    `ФИО: ${profile.displayName ?? profile.lastName ?? "не указано"}`,
    `Фамилия: ${profile.lastName ?? "не указана"}`,
    `Телефон: ${profile.phone ?? "не указан"}`,
    `MAX ID: ${profile.maxUserId}`,
    `Модель телефона: ${profile.phoneModel ?? "не указана"}`,
    `ОС: ${profile.os ?? "не указана"}`,
    `Версия приложения: ${profile.appVersion ?? "не указана"}`,
    `Всего обращений: ${profile.totalAppeals}`,
    profile.lastAppealAt ? `Последнее обращение: ${formatDateTime(profile.lastAppealAt)}` : "",
    "",
    "Последние обращения:",
    lastAppeals,
  ].filter(Boolean);

  return {
    action: "prompt",
    reply: lines.join("\n"),
    keyboard: courierPortalKeyboard(),
  };
}

function courierPortalKeyboard(): MaxInlineKeyboard {
  return [
    [{ type: "message", text: "Создать обращение" }],
    [{ type: "message", text: "Моя карточка" }],
    [{ type: "request_contact", text: "Обновить телефон" }],
  ];
}

function requestContactKeyboard(): MaxInlineKeyboard {
  return [[{ type: "request_contact", text: "Передать мой телефон" }]];
}

function isPortalMenuCommand(text: string) {
  return /^(?:\/start|start|открыть|меню|моя карточка|личный кабинет|карточка|мои обращения)$/i.test(
    text.trim(),
  );
}

function isCreateAppealCommand(text: string) {
  return /(?:создать|новое|оформить|зарегистрировать).{0,20}обращ/i.test(text.trim());
}

function statusLabel(status: AppealStatus) {
  switch (status) {
    case "closed":
      return "закрыто";
    case "in_progress":
      return "в работе";
    default:
      return "открыто";
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function nextMissingField(draft: AppealDraft, requiredFields: SupportRequiredField[]): DialogState | null {
  for (const field of requiredFields) {
    if (!draft[field]) return field;
  }
  return null;
}

function promptForField(state: DialogState, classification: SupportClassification): string {
  switch (state) {
    case "phone":
      return "Для регистрации обращения укажите номер телефона.";
    case "lastName":
      return "Укажите фамилию курьера.";
    case "description":
      return `Опишите проблему по теме «${classification.categoryLabel}»: что именно произошло?`;
    case "photoUrl":
      return "Приложите фото или скриншот проблемы.";
    case "phoneModel":
      return "Укажите модель телефона.";
    case "appVersion":
      return "Укажите версию приложения, если знаете.";
    case "os":
      return "Укажите ОС телефона: Android или iOS.";
    case "location":
      return "Укажите точку/адрес, где возникла проблема.";
    case "carrier":
      return "Укажите оператора связи.";
  }
}

async function findSimilarAppeal(userId: string, description: string) {
  const normalized = normalizeSupportText(description);
  const rows = await sql()`
    SELECT appeal_number, description_normalized, issue_text
    FROM support_appeals
    WHERE max_user_id = ${userId}
      AND status <> 'closed'
      AND created_at >= now() - INTERVAL '30 days'
  `;
  for (const row of rows) {
    const existing = nullableString(row.description_normalized) ?? normalizeSupportText(String(row.issue_text ?? ""));
    if (existing === normalized || isSimilarDescription(existing, normalized)) {
      return Number(row.appeal_number);
    }
  }
  return null;
}

async function findAppealByMessageId(messageId: string) {
  const rows = await sql()`SELECT appeal_number FROM support_appeals WHERE max_message_id = ${messageId} LIMIT 1`;
  return rows[0] ? Number(rows[0].appeal_number) : null;
}

function isSimilarDescription(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) return true;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 3));
  const bTokens = b.split(" ").filter((token) => token.length > 3);
  if (aTokens.size === 0 || bTokens.length === 0) return false;
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.length) >= 0.7;
}

function formatIssueText(draft: AppealDraft, classification: SupportClassification) {
  return [
    `Категория: ${classification.categoryLabel}`,
    `Подкатегория: ${classification.subcategory}`,
    `Фамилия: ${draft.lastName ?? "не указана"}`,
    `Телефон: ${draft.phone ?? "не указан"}`,
    draft.phoneModel ? `Модель телефона: ${draft.phoneModel}` : "",
    draft.os ? `ОС: ${draft.os}` : "",
    draft.appVersion ? `Версия приложения: ${draft.appVersion}` : "",
    draft.location ? `Точка/адрес: ${draft.location}` : "",
    draft.carrier ? `Оператор связи: ${draft.carrier}` : "",
    "",
    `Проблема: ${draft.description}`,
    draft.photoUrl ? `\nФото: ${draft.photoUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

function extractDescriptionFromTrigger(text: string) {
  const withoutPhone = text.replace(PHONE_PATTERN, "").trim();
  return withoutPhone.length >= 8 ? withoutPhone : null;
}

const PHONE_PATTERN =
  /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|(?:^|\s)9\d{9}(?:\s|$)/;

function extractPhone(text: string) {
  const match = text.match(PHONE_PATTERN);
  if (!match) return null;
  return normalizePhoneForStorage(match[0]);
}

function normalizePhoneForStorage(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+7${digits}`;
  return value.trim();
}

function extractLastName(text: string) {
  const cleaned = text.trim().replace(/[^a-zA-Zа-яА-ЯёЁ-]/g, " ").trim();
  return cleaned.split(/\s+/).find((part) => part.length >= 2) ?? null;
}

function extractPhoneModel(text: string) {
  const match = text.match(/(?:модель|телефон)\s*[:\-]?\s*([a-zа-я0-9\s-]{3,40})/i);
  return match?.[1]?.trim() ?? null;
}

function extractAppVersion(text: string) {
  const match = text.match(/(?:версия|version)\s*[:\-]?\s*([0-9][0-9a-z.\-]*)/i);
  return match?.[1]?.trim() ?? null;
}

function extractOs(text: string) {
  if (/android|андроид/i.test(text)) return "Android";
  if (/ios|iphone|айфон/i.test(text)) return "iOS";
  return null;
}

function extractOrderNumber(text: string) {
  const match =
    text.match(/заказ[ау]?\s*[#№]?\s*(\d{4,})/i) ?? text.match(/№\s*(\d{4,})/);
  return match?.[1] ?? null;
}

function getAllowedSupportChatIds(): string[] {
  const raw = getRuntimeEnv("MAX_SUPPORT_CHAT_IDS");
  if (!raw) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function isBotReplyText(text: string) {
  return /^обращение\s*№?\s*#?\d+/i.test(text.trim()) || /^для регистрации обращения/i.test(text.trim());
}

async function getDialog(conversationKey: string) {
  const rows = await sql()`SELECT state, draft FROM max_support_dialogs WHERE conversation_key = ${conversationKey} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return { state: row.state as DialogState, draft: (row.draft ?? {}) as AppealDraft };
}

async function saveDialog(conversationKey: string, chatId: string, userId: string, state: DialogState, draft: AppealDraft) {
  await sql()`
    INSERT INTO max_support_dialogs (conversation_key, chat_id, user_id, state, draft, updated_at)
    VALUES (${conversationKey}, ${chatId}, ${userId}, ${state}, ${sql().json(draft)}, now())
    ON CONFLICT (conversation_key) DO UPDATE
    SET state = EXCLUDED.state, draft = EXCLUDED.draft, updated_at = now()
  `;
}

async function clearDialog(conversationKey: string) {
  await sql()`DELETE FROM max_support_dialogs WHERE conversation_key = ${conversationKey}`;
}

async function appendMessage(input: {
  appealId: string | null;
  conversationKey: string | null;
  direction: SupportMessage["direction"];
  maxChatId: string | null;
  maxUserId: string | null;
  maxMessageId: string | null;
  text: string;
  photoUrl: string | null;
}) {
  await sql()`
    INSERT INTO support_messages (
      appeal_id, conversation_key, direction, max_chat_id, max_user_id, max_message_id, text, photo_url
    )
    VALUES (
      ${input.appealId}, ${input.conversationKey}, ${input.direction}, ${input.maxChatId},
      ${input.maxUserId}, ${input.maxMessageId}, ${input.text}, ${input.photoUrl}
    )
  `;
}

async function upsertCourierProfile(
  maxUserId: string,
  input: {
    displayName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    phoneModel?: string | null;
    os?: string | null;
    appVersion?: string | null;
  },
) {
  const rows = await sql()`
    INSERT INTO courier_profiles (max_user_id, display_name, last_name, phone, phone_model, os, app_version, updated_at)
    VALUES (
      ${maxUserId}, ${input.displayName ?? null}, ${input.lastName ?? null}, ${input.phone ?? null},
      ${input.phoneModel ?? null}, ${input.os ?? null}, ${input.appVersion ?? null}, now()
    )
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, courier_profiles.display_name),
        last_name = COALESCE(EXCLUDED.last_name, courier_profiles.last_name),
        phone = COALESCE(EXCLUDED.phone, courier_profiles.phone),
        phone_model = COALESCE(EXCLUDED.phone_model, courier_profiles.phone_model),
        os = COALESCE(EXCLUDED.os, courier_profiles.os),
        app_version = COALESCE(EXCLUDED.app_version, courier_profiles.app_version),
        updated_at = now()
    RETURNING *
  `;
  return toCourierProfile(rows[0]);
}

function resolveAnalyticsDateRange(range?: { from?: string | null; to?: string | null }) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  let fromDate = parseDateInput(range?.from) ?? defaultFrom;
  let toDate = parseDateInput(range?.to) ?? today;
  if (fromDate > toDate) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }

  return {
    from: toDateString(fromDate),
    to: toDateString(toDate),
  };
}

function parseDateInput(value?: string | null) {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pivotRows(rows: postgres.Row[], weeks: string[]): AppealsTableMetric[] {
  const map = new Map<string, AppealsTableMetric>();
  for (const row of rows) {
    const label = String(row.row_label);
    const metric = map.get(label) ?? {
      key: label,
      label,
      values: Object.fromEntries(weeks.map((week) => [week, 0])),
    };
    metric.values[String(row.week_label)] = Number(row.total ?? 0);
    map.set(label, metric);
  }
  return [...map.values()];
}

function metricFromQuality(key: string, label: string, rows: postgres.Row[], weeks: string[], field: string): AppealsTableMetric {
  const values = Object.fromEntries(weeks.map((week) => [week, 0]));
  for (const row of rows) values[String(row.week_label)] = Number(row[field] ?? 0);
  return { key, label, values };
}

function toAppeal(row: postgres.Row): Appeal {
  return {
    id: String(row.id),
    appealNumber: Number(row.appeal_number ?? 0),
    source: String(row.source),
    status: row.status as AppealStatus,
    maxChatId: nullableString(row.max_chat_id),
    maxUserId: nullableString(row.max_user_id),
    senderName: nullableString(row.sender_name),
    courierLastName: nullableString(row.courier_last_name),
    phone: nullableString(row.phone),
    phoneModel: nullableString(row.phone_model),
    os: nullableString(row.os),
    appVersion: nullableString(row.app_version),
    photoUrl: nullableString(row.photo_url),
    photoAnalysis: nullableString(row.photo_analysis),
    category: nullableString(row.category),
    classification: nullableString(row.classification),
    subcategory: nullableString(row.subcategory),
    classificationSource: nullableString(row.classification_source) as ClassificationSource | null,
    priority: nullableString(row.priority) as SupportPriority | null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    orderNumber: nullableString(row.order_number),
    issueText: String(row.issue_text),
    aiSummary: nullableString(row.ai_summary),
    aiSuggestedReply: nullableString(row.ai_suggested_reply),
    operatorReply: nullableString(row.operator_reply),
    duplicateOf: row.duplicate_of == null ? null : Number(row.duplicate_of),
    resultText: nullableString(row.result_text),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
    courierProfile: row.courier_profile ? toCourierProfile(row.courier_profile as postgres.Row) : null,
    messages: [],
  };
}

function toCourierProfile(row: postgres.Row): CourierProfile {
  return {
    id: String(row.id),
    maxUserId: String(row.max_user_id),
    displayName: nullableString(row.display_name),
    lastName: nullableString(row.last_name),
    phone: nullableString(row.phone),
    phoneModel: nullableString(row.phone_model),
    os: nullableString(row.os),
    appVersion: nullableString(row.app_version),
    notes: nullableString(row.notes),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    totalAppeals: Number(row.total_appeals ?? 0),
    lastAppealAt: row.last_appeal_at ? new Date(row.last_appeal_at as string).toISOString() : null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

function toSupportMessage(row: postgres.Row): SupportMessage {
  return {
    id: String(row.id),
    appealId: nullableString(row.appeal_id),
    direction: row.direction as SupportMessage["direction"],
    maxMessageId: nullableString(row.max_message_id),
    maxUserId: nullableString(row.max_user_id),
    text: String(row.text ?? ""),
    photoUrl: nullableString(row.photo_url),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

function toLearningInput(appeal: Appeal): LearningAppealInput {
  return {
    id: appeal.id,
    classification: appeal.classification,
    category: appeal.category,
    subcategory: appeal.subcategory,
    descriptionNormalized: null,
    issueText: appeal.issueText,
    phoneModel: appeal.phoneModel,
    os: appeal.os,
    appVersion: appeal.appVersion,
    photoUrl: appeal.photoUrl,
    photoAnalysis: appeal.photoAnalysis,
  };
}
