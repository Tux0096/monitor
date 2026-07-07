import { resolveDeliveryPointFromText } from "@/lib/delivery-point-resolver";
import { seedDeliveryPointsCatalog } from "@/lib/delivery-points-seed";
import postgres from "postgres";
import { persistAppealPhotoUrl } from "@/lib/appeal-uploads";
import {
  durationSeconds,
  formatReportDuration,
  getAppealIntakeSourceLabel,
  getResolutionMethodLabel,
  resolveIntakeSourceCode,
  type AppealResolutionMethod,
} from "@/lib/appeal-intake-sources";
import {
  deriveAutoAccounts,
  employeeMatchesAdminAccounts,
  normalizeMaxAccountInput,
  normalizeTelegramAccountInput,
  type EmployeeSenderMatch,
} from "@/lib/employee-accounts";
import { sendMaxMessage, type MaxInlineKeyboard } from "@/lib/max-bot";
import { getTelegramForumTopicName, sendTelegramMessage } from "@/lib/telegram-bot";
import { notifyNewAppealPush } from "@/lib/push-notifications";
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
  shouldRegisterSupportAppeal,
  type SupportCategory,
  type SupportClassification,
  type SupportPriority,
  type SupportRequiredField,
  type ClassificationSource,
} from "@/lib/support-classifier";

export type AppealStatus = "open" | "in_progress" | "closed";

export type EmployeeProfile = {
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
  pointId: string | null;
  pointName: string | null;
  isAdmin: boolean;
  telegramAccount: string | null;
  maxAccount: string | null;
  totalAppeals: number;
  lastAppealAt: string | null;
  updatedAt: string;
};

/** @deprecated use EmployeeProfile */
export type CourierProfile = EmployeeProfile;

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
  mergedIntoId: string | null;
  pointId: string | null;
  pointName: string | null;
  resultText: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  courierLastReadAt: string | null;
  operatorLastReadAt: string | null;
  unreadCount: number;
  courierProfile: CourierProfile | null;
  messages: SupportMessage[];
  mergedAppeals: Appeal[];
  intakeSourceCode: string | null;
  inProgressAt: string | null;
  resolutionMethod: AppealResolutionMethod | null;
  assignee: string | null;
  contractor: string | null;
  itComment: string | null;
};

export type AppealReportRow = {
  id: string;
  appealNumber: number;
  status: AppealStatus;
  date: string;
  pointName: string | null;
  incident: string;
  intakeSourceCode: string | null;
  intakeSourceLabel: string;
  initiator: string;
  receivedAt: string;
  inProgressAt: string | null;
  resolvedAt: string | null;
  resolutionMethod: AppealResolutionMethod | null;
  resolutionMethodLabel: string;
  assignee: string | null;
  contractor: string | null;
  responseTimeLabel: string;
  resolveTimeLabel: string;
  totalTimeLabel: string;
  itComment: string | null;
  channelSource: string;
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

export type AppealSourceFilter = "max" | "telegram";

export type AppealsAnalyticsRange = {
  from?: string | null;
  to?: string | null;
  source?: AppealSourceFilter | "all" | null;
};

function normalizeAnalyticsSource(source?: string | null): AppealSourceFilter | null {
  if (source === "max" || source === "telegram") return source;
  return null;
}

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
  source?: "max" | "telegram";
  telegramUsername?: string | null;
  isForum?: boolean;
  messageThreadId?: string | null;
  forumTopicName?: string | null;
  intakeSourceCode?: string | null;
};

export type SupportMessageResult = {
  action: "ignored" | "prompt" | "created" | "duplicate" | "appended" | "skipped";
  reply: string | null;
  keyboard?: MaxInlineKeyboard;
  appealNumber?: number;
  autoResolved?: boolean;
};

const APPEAL_DEDUP_HOURS = 1;

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

async function migrateCourierProfilesToEmployees() {
  const rows = await sql()`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('courier_profiles', 'employees')
  `;
  const names = new Set(rows.map((row) => String(row.tablename)));
  if (names.has("courier_profiles") && !names.has("employees")) {
    await sql()`ALTER TABLE courier_profiles RENAME TO employees`;
  }
}

async function migrateAppealsSchema() {
  await sql()`SELECT pg_advisory_lock(91020260616)`;
  try {
  await sql()`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await migrateCourierProfilesToEmployees();
  await sql()`
    CREATE TABLE IF NOT EXISTS employees (
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
      is_admin boolean NOT NULL DEFAULT false,
      telegram_account text,
      max_account text,
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
    ["merged_into_id", "uuid"],
    ["courier_last_read_at", "timestamptz"],
    ["operator_last_read_at", "timestamptz"],
    ["point_id", "uuid"],
    ["intake_source_code", "text"],
    ["in_progress_at", "timestamptz"],
    ["resolution_method", "text"],
    ["assignee", "text"],
    ["contractor", "text"],
    ["it_comment", "text"],
  ]);
  await addColumns("employees", [
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
    ["point_id", "uuid"],
    ["is_admin", "boolean NOT NULL DEFAULT false"],
    ["telegram_account", "text"],
    ["max_account", "text"],
  ]);
  await sql()`
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
  await sql()`
    CREATE INDEX IF NOT EXISTS delivery_points_name_idx
    ON delivery_points (name)
  `;
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
    CREATE INDEX IF NOT EXISTS support_appeals_merged_into_idx
    ON support_appeals (merged_into_id)
    WHERE merged_into_id IS NOT NULL
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
  await sql()`
    UPDATE support_appeals
    SET intake_source_code = 'max_courier'
    WHERE intake_source_code IS NULL AND source = 'max'
  `;
  await sql()`
    UPDATE support_appeals
    SET intake_source_code = 'telegram_support_chat'
    WHERE intake_source_code IS NULL AND source = 'telegram'
  `;
  await seedDeliveryPointsCatalog();
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
    INSERT INTO employees (
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
    SET display_name = COALESCE(employees.display_name, EXCLUDED.display_name),
        last_name = COALESCE(employees.last_name, EXCLUDED.last_name),
        phone = COALESCE(employees.phone, EXCLUDED.phone),
        phone_model = COALESCE(employees.phone_model, EXCLUDED.phone_model),
        os = COALESCE(employees.os, EXCLUDED.os),
        app_version = COALESCE(employees.app_version, EXCLUDED.app_version),
        total_appeals = GREATEST(employees.total_appeals, EXCLUDED.total_appeals),
        last_appeal_at = GREATEST(
          COALESCE(employees.last_appeal_at, '-infinity'::timestamptz),
          COALESCE(EXCLUDED.last_appeal_at, '-infinity'::timestamptz)
        ),
        updated_at = now()
  `;
  await sql()`
    INSERT INTO employees (
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
    SET display_name = COALESCE(employees.display_name, EXCLUDED.display_name),
        last_name = COALESCE(employees.last_name, EXCLUDED.last_name),
        phone = COALESCE(employees.phone, EXCLUDED.phone),
        phone_model = COALESCE(employees.phone_model, EXCLUDED.phone_model),
        os = COALESCE(employees.os, EXCLUDED.os),
        app_version = COALESCE(employees.app_version, EXCLUDED.app_version),
        total_appeals = GREATEST(employees.total_appeals, EXCLUDED.total_appeals),
        last_appeal_at = GREATEST(
          COALESCE(employees.last_appeal_at, '-infinity'::timestamptz),
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

export async function updateAppealByOperator(
  id: string,
  input: {
    issueText?: string;
    resultText?: string;
    operatorReply?: string;
    pointId?: string | null;
    status?: AppealStatus;
    intakeSourceCode?: string | null;
    inProgressAt?: string | null;
    resolutionMethod?: AppealResolutionMethod | null;
    assignee?: string | null;
    contractor?: string | null;
    itComment?: string | null;
  },
): Promise<Appeal | null> {
  await ensureAppealsSchema();
  const appeal = await getAppeal(id);
  if (!appeal) return null;
  if (appeal.mergedIntoId) {
    throw new Error("Нельзя редактировать обращение, объединённое в другой контур");
  }

  const issueText = input.issueText?.trim();
  const resultText = input.resultText?.trim();
  const operatorReply = input.operatorReply?.trim();
  const nextStatus: AppealStatus = input.status ?? appeal.status;
  const close = nextStatus === "closed";

  let nextIssueText = appeal.issueText;
  if (issueText && issueText !== appeal.issueText) {
    nextIssueText = issueText;
  }

  let classification = appeal.classification;
  let category = appeal.category;
  let subcategory = appeal.subcategory;
  let priority = appeal.priority;
  let confidence = appeal.confidence;
  let descriptionNormalized = normalizeSupportText(nextIssueText);

  if (issueText && issueText !== appeal.issueText) {
    const next = classifySupportText(issueText);
    classification = next.category;
    category = next.categoryLabel;
    subcategory = next.subcategory;
    priority = next.priority;
    confidence = next.confidence;
    descriptionNormalized = normalizeSupportText(issueText);
  }

  const nextResultText =
    resultText !== undefined ? resultText || null : appeal.resultText;
  const nextOperatorReply =
    operatorReply !== undefined ? operatorReply || null : appeal.operatorReply;
  const nextPointId = input.pointId !== undefined ? input.pointId : appeal.pointId;
  const nextIntakeSourceCode =
    input.intakeSourceCode !== undefined ? input.intakeSourceCode : appeal.intakeSourceCode;
  const nextResolutionMethod =
    input.resolutionMethod !== undefined ? input.resolutionMethod : appeal.resolutionMethod;
  const nextAssignee = input.assignee !== undefined ? input.assignee || null : appeal.assignee;
  const nextContractor =
    input.contractor !== undefined ? input.contractor || null : appeal.contractor;
  const nextItComment = input.itComment !== undefined ? input.itComment || null : appeal.itComment;
  const markInProgress = nextStatus === "in_progress" && appeal.status !== "in_progress";
  const explicitInProgressAt =
    input.inProgressAt !== undefined && input.inProgressAt
      ? input.inProgressAt
      : undefined;
  let nextInProgressAt = appeal.inProgressAt;
  if (markInProgress) {
    nextInProgressAt = explicitInProgressAt ?? new Date().toISOString();
  } else if (input.inProgressAt !== undefined) {
    nextInProgressAt = input.inProgressAt || null;
  }

  await sql()`
    UPDATE support_appeals
    SET issue_text = ${nextIssueText},
        result_text = ${nextResultText},
        operator_reply = ${nextOperatorReply},
        point_id = ${nextPointId},
        intake_source_code = ${nextIntakeSourceCode},
        in_progress_at = ${nextInProgressAt ? new Date(nextInProgressAt) : null},
        resolution_method = ${nextResolutionMethod},
        assignee = ${nextAssignee},
        contractor = ${nextContractor},
        it_comment = ${nextItComment},
        status = ${nextStatus},
        classification = ${classification},
        category = ${category},
        subcategory = ${subcategory},
        priority = ${priority},
        confidence = ${confidence},
        description_normalized = ${descriptionNormalized},
        classification_source = CASE
          WHEN ${Boolean(issueText && issueText !== appeal.issueText)} THEN 'operator'
          ELSE classification_source
        END,
        closed_at = CASE
          WHEN ${close} THEN now()
          WHEN ${nextStatus} IN ('open', 'in_progress') THEN NULL
          ELSE closed_at
        END,
        updated_at = now()
    WHERE id = ${id}
  `;

  if (operatorReply && operatorReply !== appeal.operatorReply) {
    await appendMessage({
      appealId: id,
      conversationKey: appealConversationKey(appeal),
      direction: "operator",
      maxChatId: appeal.maxChatId,
      maxUserId: appeal.maxUserId,
      maxMessageId: null,
      text: operatorReply,
      photoUrl: null,
    });
  }

  return getAppeal(id);
}

export async function reopenAppeal(id: string): Promise<Appeal | null> {
  return updateAppealByOperator(id, { status: "open" });
}

function appealConversationKey(appeal: Pick<Appeal, "maxChatId" | "maxUserId">): string | null {
  if (!appeal.maxChatId || !appeal.maxUserId) return null;
  if (appeal.maxUserId.startsWith("tg:")) {
    return `tg:${appeal.maxChatId}:${appeal.maxUserId.slice(3)}`;
  }
  return `${appeal.maxChatId}:${appeal.maxUserId}`;
}

function appealsShareCourier(left: Appeal, right: Appeal) {
  if (left.maxUserId && right.maxUserId && left.maxUserId === right.maxUserId) return true;
  const leftPhone = left.phone ? normalizePhoneForStorage(left.phone) : null;
  const rightPhone = right.phone ? normalizePhoneForStorage(right.phone) : null;
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

function toMergeCandidate(appeal: Appeal): MergeCandidate {
  const problemLine =
    appeal.issueText
      .split("\n")
      .find((line) => line.startsWith("Проблема:"))
      ?.replace(/^Проблема:\s*/, "") ?? appeal.issueText;
  return {
    id: appeal.id,
    appealNumber: appeal.appealNumber,
    status: appeal.status,
    createdAt: appeal.createdAt,
    shortText: shorten(oneLine(problemLine), 80),
    issuePreview: shorten(oneLine(problemLine), 160),
  };
}

export async function listMergeCandidates(primaryId: string): Promise<MergeCandidate[]> {
  await ensureAppealsSchema();
  const primary = await getAppeal(primaryId);
  if (!primary || primary.mergedIntoId) return [];

  const normalizedPhone = primary.phone ? normalizePhoneForStorage(primary.phone) : null;
  const rows = await sql()`
    SELECT a.*
    FROM support_appeals a
    WHERE a.id <> ${primaryId}
      AND a.merged_into_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM support_appeals child
        WHERE child.merged_into_id = a.id
      )
      AND (
        (${primary.maxUserId}::text IS NOT NULL AND a.max_user_id = ${primary.maxUserId})
        OR (${normalizedPhone}::text IS NOT NULL AND a.phone = ${normalizedPhone})
      )
    ORDER BY a.created_at DESC
    LIMIT 30
  `;

  return rows.map((row) => toMergeCandidate(toAppeal(row)));
}

async function notifyCourierAppealsMerged(primary: Appeal, secondaries: Appeal[]) {
  if (secondaries.length === 0) return;
  const numbers = secondaries.map((appeal) => `№${appeal.appealNumber}`).join(", ");
  const text = [
    `Обращения ${numbers} объединены с №${primary.appealNumber}.`,
    "Все сообщения и ответы теперь в одной карточке.",
  ].join("\n");

  if (primary.maxUserId?.startsWith("tg:") && primary.maxChatId) {
    try {
      await sendTelegramMessage(primary.maxChatId, text);
    } catch {
      // уведомление не должно блокировать объединение
    }
    return;
  }

  if (!primary.maxChatId) return;
  try {
    await sendMaxMessage(primary.maxChatId, text);
  } catch {
    // уведомление не должно блокировать объединение
  }
}

export async function mergeAppealsInto(
  primaryId: string,
  secondaryIds: string[],
): Promise<Appeal | null> {
  await ensureAppealsSchema();
  const primary = await getAppeal(primaryId);
  if (!primary) return null;
  if (primary.mergedIntoId) {
    throw new Error("Нельзя объединять в обращение, которое уже вложено в другой контур");
  }

  const uniqueSecondaryIds = [...new Set(secondaryIds.filter((id) => id && id !== primaryId))];
  if (uniqueSecondaryIds.length === 0) {
    throw new Error("Выберите обращения для объединения");
  }

  const mergedSecondaries: Appeal[] = [];

  for (const secondaryId of uniqueSecondaryIds) {
    const secondary = await getAppeal(secondaryId);
    if (!secondary) continue;
    if (!appealsShareCourier(primary, secondary)) {
      throw new Error(`Обращение №${secondary.appealNumber} от другого курьера`);
    }
    if (secondary.mergedIntoId) {
      throw new Error(`Обращение №${secondary.appealNumber} уже объединено`);
    }
    if (secondary.mergedAppeals.length > 0) {
      throw new Error(`Обращение №${secondary.appealNumber} уже является контуром для других обращений`);
    }
    mergedSecondaries.push(secondary);

    await sql()`
      UPDATE support_messages
      SET appeal_id = ${primaryId}
      WHERE appeal_id = ${secondaryId}
    `;

    await appendMessage({
      appealId: primaryId,
      conversationKey: appealConversationKey(primary),
      direction: "system",
      maxChatId: primary.maxChatId,
      maxUserId: primary.maxUserId,
      maxMessageId: null,
      text: [
        `Объединено обращение №${secondary.appealNumber}`,
        `Дата: ${formatDateTime(secondary.createdAt)}`,
        "",
        secondary.issueText,
        secondary.resultText ? `\nИтог: ${secondary.resultText}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      photoUrl: secondary.photoUrl,
    });

    if (!primary.photoUrl && secondary.photoUrl) {
      await sql()`
        UPDATE support_appeals
        SET photo_url = ${secondary.photoUrl}
        WHERE id = ${primaryId} AND photo_url IS NULL
      `;
    }

    await sql()`
      UPDATE support_appeals
      SET merged_into_id = ${primaryId},
          status = 'closed',
          result_text = ${`Объединено с обращением №${primary.appealNumber}`},
          closed_at = COALESCE(closed_at, now()),
          updated_at = now()
      WHERE id = ${secondaryId}
    `;
  }

  await sql()`
    UPDATE support_appeals
    SET updated_at = now()
    WHERE id = ${primaryId}
  `;

  await notifyCourierAppealsMerged(primary, mergedSecondaries);

  return getAppeal(primaryId);
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
        SELECT cp.*, dp.name AS point_name
        FROM employees cp
        LEFT JOIN delivery_points dp ON dp.id = cp.point_id
        WHERE
          coalesce(cp.last_name, '') ILIKE ${`%${query}%`}
          OR coalesce(cp.display_name, '') ILIKE ${`%${query}%`}
          OR coalesce(cp.phone, '') ILIKE ${`%${query}%`}
          OR cp.max_user_id ILIKE ${`%${query}%`}
          OR coalesce(cp.telegram_account, '') ILIKE ${`%${query}%`}
          OR coalesce(cp.max_account, '') ILIKE ${`%${query}%`}
        ORDER BY coalesce(cp.last_appeal_at, cp.updated_at) DESC
        LIMIT 300
      `
    : await sql()`
        SELECT cp.*, dp.name AS point_name
        FROM employees cp
        LEFT JOIN delivery_points dp ON dp.id = cp.point_id
        ORDER BY coalesce(cp.last_appeal_at, cp.updated_at) DESC
        LIMIT 300
      `;
  return rows.map(toCourierProfile);
}

export async function getCourierProfile(id: string): Promise<CourierProfile | null> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT cp.*, dp.name AS point_name
    FROM employees cp
    LEFT JOIN delivery_points dp ON dp.id = cp.point_id
    WHERE cp.id = ${id} OR cp.max_user_id = ${id}
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
    SELECT cp.*, dp.name AS point_name
    FROM employees cp
    LEFT JOIN delivery_points dp ON dp.id = cp.point_id
    WHERE cp.max_user_id = ${maxUserId}
       OR (${normalizedPhone}::text IS NOT NULL AND phone = ${normalizedPhone})
    ORDER BY CASE WHEN max_user_id = ${maxUserId} THEN 0 ELSE 1 END
    LIMIT 1
  `;
  return rows[0] ? toCourierProfile(rows[0]) : null;
}

export type CourierMiniAppProfile = {
  displayName: string | null;
  lastName: string | null;
  phone: string | null;
  totalAppeals: number;
  lastAppealAt: string | null;
};

export type CourierMiniAppAppeal = {
  id: string;
  appealNumber: number;
  status: AppealStatus;
  createdAt: string;
  shortText: string;
  unreadCount: number;
};

export type CourierMiniAppMessage = {
  id: string;
  author: "courier" | "operator" | "bot" | "ai" | "system";
  text: string;
  photoUrl: string | null;
  createdAt: string;
};

export type CourierMiniAppAppealDetail = CourierMiniAppAppeal & {
  photoUrl: string | null;
  resultText: string | null;
  issueText: string;
  messages: CourierMiniAppMessage[];
  mergedAppealNumbers: number[];
  redirectedFromAppealNumber: number | null;
};

export type MergeCandidate = {
  id: string;
  appealNumber: number;
  status: AppealStatus;
  createdAt: string;
  shortText: string;
  issuePreview: string;
};

export type CourierMiniAppBootstrap = {
  needsPhone: boolean;
  profile: CourierMiniAppProfile;
  appeals: CourierMiniAppAppeal[];
};

function toCourierMiniAppProfile(profile: CourierProfile): CourierMiniAppProfile {
  return {
    displayName: profile.displayName,
    lastName: profile.lastName,
    phone: profile.phone,
    totalAppeals: profile.totalAppeals,
    lastAppealAt: profile.lastAppealAt,
  };
}

function countUnreadForCourier(appeal: Appeal) {
  const since = appeal.courierLastReadAt
    ? new Date(appeal.courierLastReadAt).getTime()
    : 0;
  return appeal.messages.filter((message) => {
    if (message.direction === "in") return false;
    return new Date(message.createdAt).getTime() > since;
  }).length;
}

function countUnreadForOperator(appeal: Appeal) {
  const since = appeal.operatorLastReadAt
    ? new Date(appeal.operatorLastReadAt).getTime()
    : 0;
  return appeal.messages.filter((message) => {
    if (message.direction !== "in") return false;
    return new Date(message.createdAt).getTime() > since;
  }).length;
}

function attachUnreadCounts(appeals: Appeal[], role: "courier" | "operator") {
  for (const appeal of appeals) {
    appeal.unreadCount =
      role === "courier" ? countUnreadForCourier(appeal) : countUnreadForOperator(appeal);
  }
}

export async function markAppealReadByCourier(appealId: string, maxUserId: string, phone?: string | null) {
  const appeal = await getCourierOwnedAppeal(maxUserId, appealId, phone);
  if (!appeal) return false;
  await sql()`
    UPDATE support_appeals
    SET courier_last_read_at = now(), updated_at = updated_at
    WHERE id = ${appeal.id}
  `;
  return true;
}

export async function markAppealReadByOperator(appealId: string) {
  await ensureAppealsSchema();
  await sql()`
    UPDATE support_appeals
    SET operator_last_read_at = now(), updated_at = updated_at
    WHERE id = ${appealId}
  `;
  return getAppeal(appealId);
}

function toCourierMiniAppAppeal(appeal: Appeal): CourierMiniAppAppeal {
  const problemLine =
    appeal.issueText
      .split("\n")
      .find((line) => line.startsWith("Проблема:"))
      ?.replace(/^Проблема:\s*/, "") ?? appeal.issueText;
  return {
    id: appeal.id,
    appealNumber: appeal.appealNumber,
    status: appeal.status,
    createdAt: appeal.createdAt,
    shortText: shorten(oneLine(problemLine), 80),
    unreadCount: countUnreadForCourier(appeal),
  };
}

function toCourierMiniAppMessage(message: SupportMessage): CourierMiniAppMessage {
  const author: CourierMiniAppMessage["author"] =
    message.direction === "in"
      ? "courier"
      : message.direction === "operator"
        ? "operator"
        : message.direction === "ai"
          ? "ai"
          : message.direction === "system"
            ? "system"
            : "bot";
  return {
    id: message.id,
    author,
    text: message.text,
    photoUrl: message.photoUrl,
    createdAt: message.createdAt,
  };
}

async function getCourierAppealById(maxUserId: string, appealId: string, phone?: string | null) {
  await ensureAppealsSchema();
  const normalizedPhone = phone ? normalizePhoneForStorage(phone) : null;
  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name,
      (
        SELECT row_to_json(enriched)
        FROM (
          SELECT cp.*, cdp.name AS point_name
          FROM employees cp
          LEFT JOIN delivery_points cdp ON cdp.id = cp.point_id
          WHERE
            (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
            OR (a.phone IS NOT NULL AND cp.phone = a.phone)
          ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
          LIMIT 1
        ) enriched
      ) AS courier_profile
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE a.id = ${appealId}
      AND (
        a.max_user_id = ${maxUserId}
        OR (${normalizedPhone}::text IS NOT NULL AND a.phone = ${normalizedPhone})
      )
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return toAppeal(rows[0]);
}

async function resolveCourierAppealPrimary(
  maxUserId: string,
  appealId: string,
  phone?: string | null,
): Promise<{ appeal: Appeal; redirectedFrom: Appeal | null } | null> {
  const requested = await getCourierAppealById(maxUserId, appealId, phone);
  if (!requested) return null;

  if (!requested.mergedIntoId) {
    await attachMessages([requested]);
    await attachMergedAppeals([requested]);
    return { appeal: requested, redirectedFrom: null };
  }

  const primary = await getAppeal(requested.mergedIntoId);
  if (!primary || primary.mergedIntoId) return null;
  if (!appealsShareCourier(requested, primary)) return null;

  await attachMessages([primary]);
  await attachMergedAppeals([primary]);
  return { appeal: primary, redirectedFrom: requested };
}

async function getCourierOwnedAppeal(maxUserId: string, appealId: string, phone?: string | null) {
  const resolved = await resolveCourierAppealPrimary(maxUserId, appealId, phone);
  if (!resolved || resolved.redirectedFrom) {
    return resolved?.appeal ?? null;
  }
  return resolved.appeal;
}

export async function listCourierMiniAppAppeals(
  maxUserId: string,
  phone?: string | null,
  limit = 30,
): Promise<CourierMiniAppAppeal[]> {
  const appeals = await listCourierAppealsForBot(maxUserId, phone, limit);
  await attachMessages(appeals);
  attachUnreadCounts(appeals, "courier");
  return appeals.map(toCourierMiniAppAppeal);
}

export async function getCourierMiniAppAppealDetail(
  maxUserId: string,
  appealId: string,
  phone?: string | null,
): Promise<CourierMiniAppAppealDetail | null> {
  const resolved = await resolveCourierAppealPrimary(maxUserId, appealId, phone);
  if (!resolved) return null;
  const { appeal, redirectedFrom } = resolved;
  await sql()`
    UPDATE support_appeals
    SET courier_last_read_at = now(), updated_at = updated_at
    WHERE id = ${appeal.id}
  `;
  appeal.courierLastReadAt = new Date().toISOString();
  attachUnreadCounts([appeal], "courier");
  return {
    ...toCourierMiniAppAppeal(appeal),
    photoUrl: appeal.photoUrl,
    resultText: appeal.resultText,
    issueText: appeal.issueText,
    messages: appeal.messages.map(toCourierMiniAppMessage),
    mergedAppealNumbers: appeal.mergedAppeals.map((item) => item.appealNumber),
    redirectedFromAppealNumber: redirectedFrom?.appealNumber ?? null,
  };
}

export async function addCourierMiniAppAppealMessage(input: {
  maxUserId: string;
  appealId: string;
  chatId: string;
  phone?: string | null;
  text?: string;
  photoUrl?: string | null;
}) {
  const resolved = await resolveCourierAppealPrimary(input.maxUserId, input.appealId, input.phone);
  if (!resolved) {
    throw new Error("Обращение не найдено");
  }
  const appeal = resolved.appeal;

  const text = input.text?.trim() ?? "";
  const photoUrl = input.photoUrl ?? null;
  if (!text && !photoUrl) {
    throw new Error("Напишите сообщение или прикрепите фото");
  }

  const conversationKey =
    appeal.maxChatId && appeal.maxUserId ? `${appeal.maxChatId}:${appeal.maxUserId}` : `${input.chatId}:${input.maxUserId}`;

  await appendMessage({
    appealId: appeal.id,
    conversationKey,
    direction: "in",
    maxChatId: appeal.maxChatId ?? input.chatId,
    maxUserId: input.maxUserId,
    maxMessageId: null,
    text: text || "[фото]",
    photoUrl,
  });

  if (appeal.status === "closed") {
    await sql()`
      UPDATE support_appeals
      SET status = 'open', closed_at = NULL, updated_at = now()
      WHERE id = ${appeal.id}
    `;
  } else {
    await sql()`
      UPDATE support_appeals
      SET updated_at = now()
      WHERE id = ${appeal.id}
    `;
  }

  return getCourierMiniAppAppealDetail(input.maxUserId, input.appealId, input.phone);
}

export async function getCourierMiniAppBootstrap(
  maxUserId: string,
  displayName?: string | null,
  lastName?: string | null,
): Promise<CourierMiniAppBootstrap> {
  await ensureAppealsSchema();
  let profile =
    (await getCourierProfileByMaxOrPhone(maxUserId)) ??
    (await upsertCourierProfile(maxUserId, { displayName, lastName }));
  const needsPhone = !profile.phone;
  const appeals = needsPhone
    ? []
    : await listCourierMiniAppAppeals(maxUserId, profile.phone, 30);
  return {
    needsPhone,
    profile: toCourierMiniAppProfile(profile),
    appeals,
  };
}

export async function bindCourierPhoneFromMiniApp(
  maxUserId: string,
  phone: string,
  displayName?: string | null,
  lastName?: string | null,
): Promise<CourierMiniAppBootstrap> {
  await ensureAppealsSchema();
  const normalized = normalizePhoneForStorage(phone);
  const existing = await getCourierProfileByMaxOrPhone(maxUserId, normalized);
  const profile = await upsertCourierProfile(maxUserId, {
    displayName: displayName ?? existing?.displayName,
    lastName: lastName ?? existing?.lastName,
    phone: normalized,
    phoneModel: existing?.phoneModel,
    os: existing?.os,
    appVersion: existing?.appVersion,
  });
  const appeals = await listCourierMiniAppAppeals(maxUserId, profile.phone, 30);
  return {
    needsPhone: false,
    profile: toCourierMiniAppProfile(profile),
    appeals,
  };
}

export async function createCourierAppealFromMiniApp(input: {
  maxUserId: string;
  chatId: string;
  senderName?: string | null;
  description: string;
  photoUrl?: string | null;
  phoneModel?: string | null;
  os?: string | null;
  appVersion?: string | null;
}) {
  await ensureAppealsSchema();
  const description = input.description.trim();
  if (description.length < 8) {
    throw new Error("Опишите проблему подробнее — минимум 8 символов.");
  }

  const profile =
    (await getCourierProfileByMaxOrPhone(input.maxUserId)) ??
    (await upsertCourierProfile(input.maxUserId, { displayName: input.senderName }));
  if (!profile.phone) {
    throw new Error("Сначала подтвердите номер телефона.");
  }

  const draft: AppealDraft = {
    phone: profile.phone,
    lastName: profile.lastName ?? undefined,
    description,
    photoUrl: input.photoUrl ?? undefined,
    phoneModel: input.phoneModel?.trim() || profile.phoneModel || undefined,
    appVersion: input.appVersion?.trim() || profile.appVersion || undefined,
    os: input.os?.trim() || profile.os || undefined,
    senderName: input.senderName ?? profile.displayName ?? undefined,
    classification: classifySupportText(description),
  };

  const recent = await findRecentAppealByUser(input.maxUserId);
  if (recent) {
    return {
      action: "duplicate" as const,
      appealNumber: recent.appealNumber,
      reply: `Обращение №${recent.appealNumber} уже открыто. Сообщение добавлено.`,
      autoResolved: false,
    };
  }

  await upsertCourierProfile(input.maxUserId, {
    displayName: input.senderName ?? profile.displayName,
    lastName: draft.lastName ?? profile.lastName,
    phone: draft.phone,
    phoneModel: draft.phoneModel ?? profile.phoneModel,
    os: draft.os ?? profile.os,
    appVersion: draft.appVersion ?? profile.appVersion,
  });
  const savedProfile =
    (await getCourierProfileByMaxOrPhone(input.maxUserId, draft.phone ?? profile.phone)) ?? profile;

  const classification = draft.classification!;
  const suggestion = await suggestSupportReply({
    description,
    classification,
    photoUrl: draft.photoUrl ?? null,
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
  const appealPointId = await resolveAppealPointId({
    text: description,
    profilePointId: savedProfile.pointId,
    maxUserId: input.maxUserId,
  });
  const conversationKey = `${input.chatId}:${input.maxUserId}`;
  const rows = await sql()`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      courier_last_name, phone, phone_model, os, app_version, photo_url,
      photo_analysis, description_normalized, category, classification, subcategory, priority,
      confidence, classification_source, order_number, issue_text, ai_summary, ai_suggested_reply,
      operator_reply, result_text, point_id
    )
    VALUES (
      'max', ${autoResolved ? "closed" : "open"}, ${input.chatId}, ${input.maxUserId}, null,
      ${draft.senderName ?? input.senderName ?? null}, ${draft.lastName ?? null}, ${draft.phone ?? null},
      ${draft.phoneModel ?? null}, ${draft.os ?? null}, ${draft.appVersion ?? null},
      ${draft.photoUrl ?? null}, ${suggestion.photoAnalysis ?? null},
      ${normalizeSupportText(description)}, ${classification.categoryLabel},
      ${classification.category}, ${classification.subcategory}, ${classification.priority},
      ${classification.confidence}, 'auto', ${extractOrderNumber(description)}, ${formatIssueText(draft, classification)},
      ${suggestion.summary}, ${suggestion.suggestedReply},
      ${autoResolved ? suggestion.suggestedReply : null},
      ${autoResolved ? suggestion.suggestedReply : null},
      ${appealPointId ?? null}
    )
    RETURNING id, appeal_number
  `;

  const appealId = String(rows[0].id);
  const appealNumber = Number(rows[0].appeal_number);
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
    photoUrl: draft.photoUrl ?? null,
    photoAnalysis: suggestion.photoAnalysis ?? null,
  };
  if (suggestion.photoAnalysis) {
    await ingestPhotoPattern(learningAppeal, suggestion.photoAnalysis);
  }
  if (autoResolved) {
    await ingestSuccessfulAutoReply(learningAppeal, suggestion.suggestedReply);
    await sql()`
      UPDATE support_appeals
      SET closed_at = now(), updated_at = now()
      WHERE id = ${appealId}
    `;
  }

  await sql()`
    UPDATE employees
    SET total_appeals = total_appeals + 1, last_appeal_at = now(), updated_at = now()
    WHERE max_user_id = ${input.maxUserId}
  `;

  const reply = autoResolved
    ? `Обращение №${appealNumber}.\n\n${suggestion.suggestedReply}`
    : `Обращение №${appealNumber} зарегистрировано. Оператор подключится и ответит в ближайшее время.`;

  await appendMessage({
    appealId,
    conversationKey,
    direction: autoResolved ? "ai" : "bot",
    maxChatId: input.chatId,
    maxUserId: input.maxUserId,
    maxMessageId: null,
    text: reply,
    photoUrl: null,
  });

  if (!autoResolved) {
    void notifyNewAppealPush({
      appealNumber,
      preview: description,
      domain: "appeals",
    });
  }

  return {
    action: "created" as const,
    appealNumber,
    reply,
    autoResolved,
  };
}

export async function listCourierAppealsForBot(
  maxUserId: string,
  phone?: string | null,
  limit = 5,
): Promise<Appeal[]> {
  await ensureAppealsSchema();
  const normalizedPhone = phone ? normalizePhoneForStorage(phone) : null;
  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name,
      (
        SELECT row_to_json(enriched)
        FROM (
          SELECT cp.*, cdp.name AS point_name
          FROM employees cp
          LEFT JOIN delivery_points cdp ON cdp.id = cp.point_id
          WHERE
            (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
            OR (a.phone IS NOT NULL AND cp.phone = a.phone)
          ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
          LIMIT 1
        ) enriched
      ) AS courier_profile
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE (a.max_user_id = ${maxUserId}
       OR (${normalizedPhone}::text IS NOT NULL AND a.phone = ${normalizedPhone}))
      AND a.merged_into_id IS NULL
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toAppeal);
}

export async function listAppeals(status?: string, source?: string): Promise<Appeal[]> {
  await ensureAppealsSchema();
  await syncCourierProfilesFromAppeals();
  await autoAssignAppealClassifications();
  const statusFilter = status && status !== "all" ? status : null;
  const sourceFilter = normalizeAnalyticsSource(source);
  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name,
      (
        SELECT row_to_json(enriched)
        FROM (
          SELECT cp.*, cdp.name AS point_name
          FROM employees cp
          LEFT JOIN delivery_points cdp ON cdp.id = cp.point_id
          WHERE
            (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
            OR (a.phone IS NOT NULL AND cp.phone = a.phone)
          ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
          LIMIT 1
        ) enriched
      ) AS courier_profile
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE a.merged_into_id IS NULL
      AND (${statusFilter}::text IS NULL OR a.status = ${statusFilter})
      AND (${sourceFilter}::text IS NULL OR a.source = ${sourceFilter})
    ORDER BY a.created_at DESC
    LIMIT 200
  `;
  const appeals = rows.map(toAppeal);
  await attachMessages(appeals);
  await attachMergedAppeals(appeals);
  attachUnreadCounts(appeals, "operator");
  return appeals;
}

function extractIncidentText(issueText: string): string {
  const problemLine = issueText
    .split("\n")
    .find((line) => line.startsWith("Проблема:"))
    ?.replace(/^Проблема:\s*/, "")
    .trim();
  return problemLine || issueText.split("\n").filter(Boolean).slice(-1)[0]?.trim() || issueText.trim();
}

function formatReportInitiator(appeal: Pick<Appeal, "senderName" | "courierLastName" | "phone">): string {
  const name = [appeal.senderName, appeal.courierLastName].filter(Boolean).join(" ").trim();
  if (name && appeal.phone) return `${name} · ${appeal.phone}`;
  return name || appeal.phone || "—";
}

function toAppealReportRow(appeal: Appeal): AppealReportRow {
  const receivedAt = appeal.createdAt;
  const inProgressAt = appeal.inProgressAt;
  const resolvedAt = appeal.closedAt;
  const responseSeconds = durationSeconds(receivedAt, inProgressAt);
  const resolveSeconds = durationSeconds(inProgressAt, resolvedAt);
  const totalSeconds = durationSeconds(receivedAt, resolvedAt);

  return {
    id: appeal.id,
    appealNumber: appeal.appealNumber,
    status: appeal.status,
    date: receivedAt.slice(0, 10),
    pointName: appeal.pointName,
    incident: extractIncidentText(appeal.issueText),
    intakeSourceCode: appeal.intakeSourceCode,
    intakeSourceLabel: getAppealIntakeSourceLabel(
      appeal.intakeSourceCode ??
        resolveIntakeSourceCode({
          channel:
            appeal.source === "max" || appeal.source === "telegram" || appeal.source === "manual"
              ? appeal.source
              : "manual",
        }),
    ),
    initiator: formatReportInitiator(appeal),
    receivedAt,
    inProgressAt,
    resolvedAt,
    resolutionMethod: appeal.resolutionMethod,
    resolutionMethodLabel: getResolutionMethodLabel(appeal.resolutionMethod),
    assignee: appeal.assignee,
    contractor: appeal.contractor,
    responseTimeLabel: formatReportDuration(responseSeconds),
    resolveTimeLabel: formatReportDuration(resolveSeconds),
    totalTimeLabel: formatReportDuration(totalSeconds),
    itComment: appeal.itComment,
    channelSource: appeal.source,
  };
}

export async function listAppealsReport(range?: {
  from?: string | null;
  to?: string | null;
  source?: AppealSourceFilter | "all" | null;
  channel?: "it" | "courier";
}): Promise<AppealReportRow[]> {
  await ensureAppealsSchema();
  const channel = range?.channel ?? "it";
  const sourceFilter = channel === "courier" ? "max" : normalizeAnalyticsSource(range?.source ?? null);
  const fromDate = range?.from ? new Date(`${range.from}T00:00:00.000Z`) : null;
  const toDate = range?.to ? new Date(`${range.to}T23:59:59.999Z`) : null;

  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE a.merged_into_id IS NULL
      AND (
        (${channel} = 'it' AND a.source <> 'max')
        OR (${channel} = 'courier' AND a.source = 'max')
      )
      AND (${sourceFilter}::text IS NULL OR a.source = ${sourceFilter})
      AND (${fromDate}::timestamptz IS NULL OR a.created_at >= ${fromDate})
      AND (${toDate}::timestamptz IS NULL OR a.created_at <= ${toDate})
    ORDER BY a.created_at DESC
    LIMIT 500
  `;

  const appeals = rows.map((row) => toAppeal(row));
  let filtered = appeals;
  if (channel === "it") {
    const adminRows = await loadAdminEmployeeRows();
    filtered = appeals.filter((appeal) => !appealInitiatorIsAdmin(appeal, adminRows));
  }

  return filtered.map((appeal) => toAppealReportRow(appeal));
}

export async function createManualAppeal(input: {
  incident: string;
  pointId?: string | null;
  intakeSourceCode: string;
  initiatorName?: string | null;
  initiatorLastName?: string | null;
  phone?: string | null;
  assignee?: string | null;
  contractor?: string | null;
  itComment?: string | null;
  receivedAt?: string | null;
}): Promise<Appeal> {
  await ensureAppealsSchema();
  const incident = input.incident.trim();
  if (incident.length < 4) {
    throw new Error("Опишите инцидент подробнее");
  }

  const classification = classifySupportText(incident);
  const draft: AppealDraft = {
    senderName: input.initiatorName?.trim() || undefined,
    lastName: input.initiatorLastName?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    description: incident,
    classification,
  };
  const issueText = formatIssueText(draft, classification);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  const intakeSourceCode = resolveIntakeSourceCode({
    channel: "manual",
    manualCode: input.intakeSourceCode,
  });
  const resolvedPointId =
    input.pointId ??
    (await resolveAppealPointId({ text: incident, profilePointId: null }));

  const rows = await sql()`
    INSERT INTO support_appeals (
      source,
      status,
      sender_name,
      courier_last_name,
      phone,
      description_normalized,
      category,
      classification,
      subcategory,
      priority,
      confidence,
      classification_source,
      issue_text,
      point_id,
      intake_source_code,
      assignee,
      contractor,
      it_comment,
      created_at,
      updated_at
    )
    VALUES (
      'manual',
      'open',
      ${input.initiatorName?.trim() || null},
      ${input.initiatorLastName?.trim() || null},
      ${input.phone?.trim() || null},
      ${normalizeSupportText(incident)},
      ${classification.categoryLabel},
      ${classification.category},
      ${classification.subcategory},
      ${classification.priority},
      ${classification.confidence},
      'operator',
      ${issueText},
      ${resolvedPointId ?? null},
      ${intakeSourceCode},
      ${input.assignee?.trim() || null},
      ${input.contractor?.trim() || null},
      ${input.itComment?.trim() || null},
      ${receivedAt},
      ${receivedAt}
    )
    RETURNING id
  `;

  const appeal = await getAppeal(String(rows[0].id));
  if (!appeal) {
    throw new Error("Не удалось создать обращение");
  }
  void notifyNewAppealPush({
    appealNumber: appeal.appealNumber,
    preview: incident,
    domain: "appeals_report",
  });
  return appeal;
}

export async function getAppeal(id: string): Promise<Appeal | null> {
  await ensureAppealsSchema();
  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name,
      (
        SELECT row_to_json(enriched)
        FROM (
          SELECT cp.*, cdp.name AS point_name
          FROM employees cp
          LEFT JOIN delivery_points cdp ON cdp.id = cp.point_id
          WHERE
            (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
            OR (a.phone IS NOT NULL AND cp.phone = a.phone)
          ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
          LIMIT 1
        ) enriched
      ) AS courier_profile
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE a.id = ${id}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const appeal = toAppeal(rows[0]);
  await attachMessages([appeal]);
  await attachMergedAppeals([appeal]);
  attachUnreadCounts([appeal], "operator");
  return appeal;
}

async function attachMergedAppeals(appeals: Appeal[]) {
  const ids = appeals.map((appeal) => appeal.id);
  if (ids.length === 0) return;

  const rows = await sql()`
    SELECT a.*, ap.name AS appeal_point_name,
      (
        SELECT row_to_json(enriched)
        FROM (
          SELECT cp.*, cdp.name AS point_name
          FROM employees cp
          LEFT JOIN delivery_points cdp ON cdp.id = cp.point_id
          WHERE
            (a.max_user_id IS NOT NULL AND cp.max_user_id = a.max_user_id)
            OR (a.phone IS NOT NULL AND cp.phone = a.phone)
          ORDER BY CASE WHEN cp.max_user_id = a.max_user_id THEN 0 ELSE 1 END
          LIMIT 1
        ) enriched
      ) AS courier_profile
    FROM support_appeals a
    LEFT JOIN delivery_points ap ON ap.id = a.point_id
    WHERE a.merged_into_id = ANY(${ids})
    ORDER BY a.created_at ASC
  `;

  const byPrimary = new Map<string, Appeal[]>();
  for (const row of rows) {
    const primaryId = String(row.merged_into_id);
    const list = byPrimary.get(primaryId) ?? [];
    list.push(toAppeal(row));
    byPrimary.set(primaryId, list);
  }

  for (const appeal of appeals) {
    appeal.mergedAppeals = byPrimary.get(appeal.id) ?? [];
  }
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
    SET operator_reply = ${text}, operator_last_read_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  await ingestOperatorReply(toLearningInput(appeal), text);
  return appeal;
}

export async function updateCourierProfile(
  maxUserId: string,
  input: Partial<
    Pick<
      EmployeeProfile,
      | "displayName"
      | "lastName"
      | "phone"
      | "phoneModel"
      | "os"
      | "appVersion"
      | "notes"
      | "tags"
      | "pointId"
      | "isAdmin"
      | "telegramAccount"
      | "maxAccount"
    >
  >,
) {
  await ensureAppealsSchema();
  const telegramAccount =
    input.telegramAccount !== undefined
      ? normalizeTelegramAccountInput(input.telegramAccount)
      : undefined;
  const maxAccount =
    input.maxAccount !== undefined ? normalizeMaxAccountInput(input.maxAccount) : undefined;
  const rows = await sql()`
    INSERT INTO employees (
      max_user_id,
      display_name,
      last_name,
      phone,
      phone_model,
      os,
      app_version,
      notes,
      tags,
      point_id,
      is_admin,
      telegram_account,
      max_account,
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
      ${input.pointId !== undefined ? input.pointId : null},
      ${input.isAdmin ?? false},
      ${telegramAccount ?? null},
      ${maxAccount ?? null},
      now()
    )
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, employees.display_name),
        last_name = COALESCE(EXCLUDED.last_name, employees.last_name),
        phone = COALESCE(EXCLUDED.phone, employees.phone),
        phone_model = COALESCE(EXCLUDED.phone_model, employees.phone_model),
        os = COALESCE(EXCLUDED.os, employees.os),
        app_version = COALESCE(EXCLUDED.app_version, employees.app_version),
        notes = COALESCE(EXCLUDED.notes, employees.notes),
        tags = CASE WHEN cardinality(EXCLUDED.tags) > 0 THEN EXCLUDED.tags ELSE employees.tags END,
        point_id = CASE
          WHEN ${input.pointId !== undefined} THEN EXCLUDED.point_id
          ELSE employees.point_id
        END,
        is_admin = CASE
          WHEN ${input.isAdmin !== undefined} THEN EXCLUDED.is_admin
          ELSE employees.is_admin
        END,
        telegram_account = CASE
          WHEN ${input.telegramAccount !== undefined} THEN EXCLUDED.telegram_account
          ELSE employees.telegram_account
        END,
        max_account = CASE
          WHEN ${input.maxAccount !== undefined} THEN EXCLUDED.max_account
          ELSE employees.max_account
        END,
        updated_at = now()
    RETURNING *
  `;
  const profile = toCourierProfile(rows[0]);
  if (profile.pointId) {
    const pointRows = await sql()`
      SELECT name FROM delivery_points WHERE id = ${profile.pointId} LIMIT 1
    `;
    profile.pointName = pointRows[0]?.name ? String(pointRows[0].name) : null;
  }
  return profile;
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

export async function readAppealAnalytics(range?: AppealsAnalyticsRange): Promise<AppealAnalyticsRow[]> {
  await ensureAppealsSchema();
  const { from, to } = resolveAnalyticsDateRange(range);
  const sourceFilter = normalizeAnalyticsSource(range?.source);
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
      AND (${sourceFilter}::text IS NULL OR source = ${sourceFilter})
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

export async function readAppealsAnalyticsReport(range?: AppealsAnalyticsRange): Promise<AppealsAnalyticsReport> {
  await ensureAppealsSchema();
  const { from, to } = resolveAnalyticsDateRange(range);
  const sourceFilter = normalizeAnalyticsSource(range?.source);
  const weekRows = await sql()`
    SELECT DISTINCT to_char(date_trunc('week', created_at), 'DD.MM - ') ||
      to_char(date_trunc('week', created_at) + INTERVAL '6 days', 'DD.MM') AS label,
      date_trunc('week', created_at) AS week_start
    FROM support_appeals
    WHERE created_at::date >= ${from}::date
      AND created_at::date <= ${to}::date
      AND (${sourceFilter}::text IS NULL OR source = ${sourceFilter})
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
      AND (${sourceFilter}::text IS NULL OR source = ${sourceFilter})
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
      AND (${sourceFilter}::text IS NULL OR source = ${sourceFilter})
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
      AND (${sourceFilter}::text IS NULL OR source = ${sourceFilter})
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

  if (
    await isEmployeeAdmin({
      platformUserId: input.userId,
      source: "max",
    })
  ) {
    return { action: "skipped", reply: null };
  }

  const conversationKey = `${input.chatId}:${input.userId}`;
  await upsertCourierProfile(input.userId, {
    displayName: input.senderName,
    lastName: input.senderLastName,
  });

  return handleSupportChatMessage(
    "max",
    conversationKey,
    {
      ...input,
      intakeSourceCode: resolveIntakeSourceCode({ channel: "max" }),
    },
    input.userId,
  );
}

export async function handleTelegramSupportMessage(
  input: SupportMessageInput,
): Promise<SupportMessageResult> {
  await ensureAppealsSchema();
  if (input.isBot || isBotReplyText(input.text)) return { action: "skipped", reply: null };
  const allowedChatIds = getAllowedTelegramChatIds();
  if (allowedChatIds.length > 0 && !allowedChatIds.includes(input.chatId)) {
    return { action: "skipped", reply: null };
  }
  if (input.isForum) {
    if (!(await isAllowedTelegramForumTopic(input.chatId, input.messageThreadId))) {
      return { action: "skipped", reply: null };
    }
  }
  if (!input.userId) return { action: "skipped", reply: null };

  let forumTopicName = input.forumTopicName ?? null;
  if (!forumTopicName && input.isForum && input.messageThreadId) {
    forumTopicName = await getTelegramForumTopicName(input.chatId, Number(input.messageThreadId));
  }
  const intakeSourceCode = resolveIntakeSourceCode({
    channel: "telegram",
    topicName: forumTopicName,
  });

  const profileKey = `tg:${input.userId}`;
  const conversationKey = `tg:${input.chatId}:${input.userId}`;

  if (
    await isEmployeeAdmin({
      platformUserId: profileKey,
      telegramUsername: input.telegramUsername,
      source: "telegram",
    })
  ) {
    return { action: "skipped", reply: null };
  }

  await upsertCourierProfile(profileKey, {
    displayName: input.senderName,
    lastName: input.senderLastName,
    telegramUsername: input.telegramUsername,
  });

  return handleSupportChatMessage(
    "telegram",
    conversationKey,
    {
      ...input,
      userId: profileKey,
      messageId: input.messageId ? `tg:${input.messageId}` : null,
      forumTopicName,
      intakeSourceCode,
    },
    profileKey,
  );
}

async function handleSupportChatMessage(
  source: "max" | "telegram",
  conversationKey: string,
  input: SupportMessageInput,
  profileUserId: string,
): Promise<SupportMessageResult> {
  if (
    await isEmployeeAdmin({
      platformUserId: profileUserId,
      telegramUsername: input.telegramUsername,
      source,
    })
  ) {
    return { action: "skipped", reply: null };
  }

  const photoUrl = input.photoUrl ? await persistAppealPhotoUrl(input.photoUrl) : null;
  const message = { ...input, photoUrl };

  const isTrigger = shouldRegisterSupportAppeal(message.text, Boolean(message.photoUrl));
  const hasContent = Boolean(message.text.trim() || message.photoUrl);
  if (!hasContent) return { action: "ignored", reply: null };

  const messageDuplicate = message.messageId ? await findAppealByMessageId(message.messageId) : null;
  if (messageDuplicate) {
    return {
      action: "duplicate",
      appealNumber: messageDuplicate,
      reply: `Обращение №${messageDuplicate} уже зарегистрировано.`,
    };
  }

  const recent = await findRecentAppealByUser(profileUserId);
  if (recent) {
    return appendToRecentAppeal(recent, conversationKey, message, isTrigger);
  }

  if (!isTrigger) {
    await appendMessage({
      appealId: null,
      conversationKey,
      direction: "in",
      maxChatId: message.chatId,
      maxUserId: profileUserId,
      maxMessageId: message.messageId,
      text: message.text,
      photoUrl: message.photoUrl,
    });
    return { action: "ignored", reply: null };
  }

  const profile =
    (await getCourierProfileByMaxOrPhone(profileUserId)) ??
    (await upsertCourierProfile(profileUserId, {
      displayName: message.senderName,
      lastName: message.senderLastName,
    }));

  await clearDialog(conversationKey);
  return createAppealFromChatMessage(source, conversationKey, { ...message, userId: profileUserId }, profile);
}

async function appendToRecentAppeal(
  recent: { id: string; appealNumber: number },
  conversationKey: string,
  input: SupportMessageInput,
  isTrigger: boolean,
): Promise<SupportMessageResult> {
  await appendMessage({
    appealId: recent.id,
    conversationKey,
    direction: "in",
    maxChatId: input.chatId,
    maxUserId: input.userId,
    maxMessageId: input.messageId,
    text: input.text,
    photoUrl: input.photoUrl,
  });

  if (input.photoUrl) {
    await sql()`
      UPDATE support_appeals
      SET photo_url = coalesce(photo_url, ${input.photoUrl}),
          updated_at = now()
      WHERE id = ${recent.id}
    `;
  }

  await sql()`
    UPDATE support_appeals
    SET updated_at = now()
    WHERE id = ${recent.id}
  `;

  if (isTrigger) {
    return {
      action: "duplicate",
      appealNumber: recent.appealNumber,
      reply: `Обращение №${recent.appealNumber} уже открыто. Сообщение добавлено.`,
    };
  }

  return { action: "appended", appealNumber: recent.appealNumber, reply: null };
}

async function createAppealFromChatMessage(
  source: "max" | "telegram",
  conversationKey: string,
  input: SupportMessageInput,
  profile: CourierProfile,
): Promise<SupportMessageResult> {
  if (
    await isEmployeeAdmin({
      platformUserId: input.userId ?? profile.maxUserId,
      telegramUsername: input.telegramUsername,
      source,
    })
  ) {
    return { action: "skipped", reply: null };
  }

  const description =
    input.text.trim() ||
    (input.photoUrl ? "Приложено фото без текста" : "");
  if (!description && !input.photoUrl) {
    return { action: "ignored", reply: null };
  }

  const messageDuplicate = input.messageId ? await findAppealByMessageId(input.messageId) : null;
  if (messageDuplicate) {
    return {
      action: "duplicate",
      appealNumber: messageDuplicate,
      reply: `Обращение №${messageDuplicate} уже зарегистрировано.`,
    };
  }

  const draft: AppealDraft = {
    senderName: input.senderName ?? undefined,
    messageId: input.messageId ?? undefined,
    phone: extractPhone(input.text) ?? profile.phone ?? undefined,
    lastName: input.senderLastName?.trim() || profile.lastName || undefined,
    description,
    photoUrl: input.photoUrl ?? undefined,
    phoneModel: extractPhoneModel(input.text) ?? profile.phoneModel ?? undefined,
    appVersion: extractAppVersion(input.text) ?? profile.appVersion ?? undefined,
    os: extractOs(input.text) ?? profile.os ?? undefined,
    classification: classifySupportText(description),
  };

  await upsertCourierProfile(input.userId!, {
    displayName: input.senderName ?? profile.displayName,
    lastName: draft.lastName ?? profile.lastName,
    phone: draft.phone ?? profile.phone,
    phoneModel: draft.phoneModel ?? profile.phoneModel,
    os: draft.os ?? profile.os,
    appVersion: draft.appVersion ?? profile.appVersion,
  });
  const savedProfile =
    (await getCourierProfileByMaxOrPhone(input.userId!, draft.phone ?? profile.phone)) ?? profile;

  const classification = classifySupportText(
    [description, draft.phoneModel, draft.os, draft.appVersion, draft.lastName].filter(Boolean).join("\n"),
  );
  draft.classification = classification;

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

  const intakeSourceCode =
    input.intakeSourceCode ??
    resolveIntakeSourceCode({
      channel: source,
      topicName: input.forumTopicName,
    });

  const appealPointId = await resolveAppealPointId({
    text: [description, draft.lastName].filter(Boolean).join("\n"),
    profilePointId: savedProfile.pointId,
    maxUserId: input.userId ?? undefined,
  });

  const rows = await sql()`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      courier_last_name, phone, phone_model, os, app_version, photo_url,
      photo_analysis, description_normalized, category, classification, subcategory, priority,
      confidence, classification_source, order_number, issue_text, ai_summary, ai_suggested_reply,
      operator_reply, result_text, point_id, intake_source_code
    )
    VALUES (
      ${source}, 'open', ${input.chatId}, ${input.userId}, ${draft.messageId ?? input.messageId},
      ${draft.senderName ?? input.senderName}, ${draft.lastName ?? null}, ${draft.phone ?? null},
      ${draft.phoneModel ?? null}, ${draft.os ?? null}, ${draft.appVersion ?? null},
      ${draft.photoUrl ?? null}, ${suggestion.photoAnalysis ?? null},
      ${normalizeSupportText(description)}, ${classification.categoryLabel},
      ${classification.category}, ${classification.subcategory}, ${classification.priority},
      ${classification.confidence}, 'auto', ${extractOrderNumber(description)}, ${formatIssueText(draft, classification)},
      ${suggestion.summary}, ${suggestion.suggestedReply},
      NULL, NULL,
      ${appealPointId ?? null},
      ${intakeSourceCode}
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
  await sql()`
    UPDATE support_messages
    SET appeal_id = ${appealId}
    WHERE conversation_key = ${conversationKey} AND appeal_id IS NULL
  `;
  await sql()`
    UPDATE employees
    SET total_appeals = total_appeals + 1, last_appeal_at = now(), updated_at = now()
    WHERE max_user_id = ${input.userId}
  `;

  const appealNumber = Number(rows[0].appeal_number);
  const reply = `Обращение №${appealNumber} зарегистрировано.`;
  await appendMessage({
    appealId,
    conversationKey,
    direction: "bot",
    maxChatId: input.chatId,
    maxUserId: input.userId,
    maxMessageId: null,
    text: reply,
    photoUrl: null,
  });
  void notifyNewAppealPush({
    appealNumber,
    preview: description,
    domain: source === "telegram" ? "appeals" : "appeals",
  });
  return { action: "created", appealNumber, reply };
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
        "Нажмите «Открыть» и подтвердите номер телефона из MAX — он сохранится один раз для личного кабинета.",
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

  const recent = await findRecentAppealByUser(input.userId!);
  if (recent) {
    await clearDialog(conversationKey);
    return appendToRecentAppeal(recent, conversationKey, input, true);
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
  const savedProfile =
    (await getCourierProfileByMaxOrPhone(input.userId!, draft.phone ?? profile.phone)) ?? profile;
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
  const appealPointId = await resolveAppealPointId({
    text: [description, draft.lastName].filter(Boolean).join("\n"),
    profilePointId: savedProfile.pointId,
    maxUserId: input.userId!,
  });
  const rows = await sql()`
    INSERT INTO support_appeals (
      source, status, max_chat_id, max_user_id, max_message_id, sender_name,
      courier_last_name, phone, phone_model, os, app_version, photo_url,
      photo_analysis, description_normalized, category, classification, subcategory, priority,
      confidence, classification_source, order_number, issue_text, ai_summary, ai_suggested_reply,
      operator_reply, result_text, point_id
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
      ${autoResolved ? suggestion.suggestedReply : null},
      ${appealPointId ?? null}
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
    UPDATE employees
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
  const name = profile.displayName ?? profile.lastName ?? "курьер";
  const lines = [
    `${name}`,
    profile.phone ? `Телефон: ${profile.phone}` : "",
    `Обращений: ${profile.totalAppeals}`,
    profile.lastAppealAt ? `Последнее: ${formatDateTime(profile.lastAppealAt)}` : "",
    "",
    "Нажмите «Открыть» для личного кабинета и формы обращения.",
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

async function findRecentAppealByUser(userId: string, hours = APPEAL_DEDUP_HOURS) {
  const rows = await sql()`
    SELECT id, appeal_number
    FROM support_appeals
    WHERE max_user_id = ${userId}
      AND merged_into_id IS NULL
      AND created_at >= now() - interval '1 hour'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: String(row.id), appealNumber: Number(row.appeal_number) };
}

async function findAppealByMessageId(messageId: string) {
  const rows = await sql()`SELECT appeal_number FROM support_appeals WHERE max_message_id = ${messageId} LIMIT 1`;
  return rows[0] ? Number(rows[0].appeal_number) : null;
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
    draft.photoUrl ? "Фото приложено" : "",
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

function getAllowedTelegramChatIds(): string[] {
  const raw = getRuntimeEnv("TELEGRAM_SUPPORT_CHAT_IDS");
  if (!raw) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function getTelegramItTopicNames(): string[] {
  const raw = getRuntimeEnv("TELEGRAM_IT_TOPIC_NAMES") || "IT заявки,it заявки,айти заявки";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function parseTelegramItTopicAllowlist(): Array<{ chatId: string | null; threadId: string }> {
  const raw = getRuntimeEnv("TELEGRAM_IT_TOPIC_IDS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) {
        return { chatId: null, threadId: entry };
      }
      return {
        chatId: entry.slice(0, separator).trim(),
        threadId: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.threadId);
}

function isTelegramItTopicName(topicName: string): boolean {
  const normalized = topicName.trim().toLowerCase();
  return getTelegramItTopicNames().some(
    (allowed) => normalized === allowed || normalized.includes(allowed),
  );
}

function isAllowedTelegramTopicById(chatId: string, messageThreadId: string): boolean | null {
  const allowlist = parseTelegramItTopicAllowlist();
  if (allowlist.length === 0) return null;
  return allowlist.some(
    (entry) =>
      entry.threadId === messageThreadId && (entry.chatId == null || entry.chatId === chatId),
  );
}

async function isAllowedTelegramForumTopic(
  chatId: string,
  messageThreadId: string | null | undefined,
): Promise<boolean> {
  if (!messageThreadId) return false;

  const allowedById = isAllowedTelegramTopicById(chatId, messageThreadId);
  if (allowedById === true) return true;
  if (allowedById === false) return false;

  const topicName = await getTelegramForumTopicName(chatId, Number(messageThreadId));
  return Boolean(topicName && isTelegramItTopicName(topicName));
}

function getAllowedSupportChatIds(): string[] {
  const raw = getRuntimeEnv("MAX_SUPPORT_CHAT_IDS");
  if (!raw) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function isBotReplyText(text: string) {
  const normalized = text.trim();
  return (
    /^обращение\s*№?\s*#?\d+/i.test(normalized) ||
    /^для регистрации обращения/i.test(normalized) ||
    /^обращение\s*№?\s*#?\d+\s*уже\s+открыто/i.test(normalized)
  );
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

async function isEmployeeAdmin(match: EmployeeSenderMatch): Promise<boolean> {
  const admins = await loadAdminEmployeeRows();
  return appealInitiatorIsAdmin(
    {
      maxUserId: match.platformUserId,
      source: match.source,
      telegramUsername: match.telegramUsername,
    },
    admins,
  );
}

type AdminEmployeeRow = {
  platformUserId: string;
  telegramAccount: string | null;
  maxAccount: string | null;
};

async function loadAdminEmployeeRows(): Promise<AdminEmployeeRow[]> {
  const rows = await sql()`
    SELECT max_user_id, telegram_account, max_account
    FROM employees
    WHERE is_admin = true
  `;
  return rows.map((row) => ({
    platformUserId: String(row.max_user_id),
    telegramAccount: nullableString(row.telegram_account),
    maxAccount: nullableString(row.max_account),
  }));
}

function appealInitiatorIsAdmin(
  appeal: Pick<Appeal, "maxUserId" | "source"> & { telegramUsername?: string | null },
  admins: AdminEmployeeRow[],
): boolean {
  if (!appeal.maxUserId || admins.length === 0) return false;
  const channel =
    appeal.source === "telegram" || appeal.maxUserId.startsWith("tg:") ? "telegram" : "max";
  const match: EmployeeSenderMatch = {
    platformUserId: appeal.maxUserId,
    telegramUsername: appeal.telegramUsername,
    source: channel,
  };
  return admins.some((row) =>
    employeeMatchesAdminAccounts(
      {
        isAdmin: true,
        platformUserId: row.platformUserId,
        telegramAccount: row.telegramAccount,
        maxAccount: row.maxAccount,
      },
      match,
    ),
  );
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

async function resolveAppealPointId(input: {
  text: string;
  profilePointId?: string | null;
  maxUserId?: string;
}): Promise<string | null> {
  const resolved = await resolveDeliveryPointFromText(input.text, input.profilePointId);
  if (!resolved || resolved.confidence < 0.65) {
    return input.profilePointId ?? null;
  }

  if (
    input.maxUserId &&
    resolved.confidence >= 0.8 &&
    resolved.id !== input.profilePointId
  ) {
    await updateCourierProfile(input.maxUserId, { pointId: resolved.id });
  }

  return resolved.id;
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
    telegramUsername?: string | null;
  },
) {
  const auto = deriveAutoAccounts(maxUserId, input.telegramUsername);
  const rows = await sql()`
    INSERT INTO employees (
      max_user_id, display_name, last_name, phone, phone_model, os, app_version,
      telegram_account, max_account, updated_at
    )
    VALUES (
      ${maxUserId}, ${input.displayName ?? null}, ${input.lastName ?? null}, ${input.phone ?? null},
      ${input.phoneModel ?? null}, ${input.os ?? null}, ${input.appVersion ?? null},
      ${auto.telegramAccount}, ${auto.maxAccount}, now()
    )
    ON CONFLICT (max_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, employees.display_name),
        last_name = COALESCE(EXCLUDED.last_name, employees.last_name),
        phone = COALESCE(EXCLUDED.phone, employees.phone),
        phone_model = COALESCE(EXCLUDED.phone_model, employees.phone_model),
        os = COALESCE(EXCLUDED.os, employees.os),
        app_version = COALESCE(EXCLUDED.app_version, employees.app_version),
        telegram_account = COALESCE(employees.telegram_account, EXCLUDED.telegram_account),
        max_account = COALESCE(employees.max_account, EXCLUDED.max_account),
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
    mergedIntoId: nullableString(row.merged_into_id),
    pointId: nullableString(row.point_id),
    pointName: nullableString(row.appeal_point_name),
    resultText: nullableString(row.result_text),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
    courierLastReadAt: row.courier_last_read_at
      ? new Date(row.courier_last_read_at as string).toISOString()
      : null,
    operatorLastReadAt: row.operator_last_read_at
      ? new Date(row.operator_last_read_at as string).toISOString()
      : null,
    unreadCount: 0,
    courierProfile: row.courier_profile ? toCourierProfile(row.courier_profile as postgres.Row) : null,
    messages: [],
    mergedAppeals: [],
    intakeSourceCode: nullableString(row.intake_source_code),
    inProgressAt: row.in_progress_at
      ? new Date(row.in_progress_at as string).toISOString()
      : null,
    resolutionMethod: nullableString(row.resolution_method) as AppealResolutionMethod | null,
    assignee: nullableString(row.assignee),
    contractor: nullableString(row.contractor),
    itComment: nullableString(row.it_comment),
  };
}

function toCourierProfile(row: postgres.Row): EmployeeProfile {
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
    pointId: nullableString(row.point_id),
    pointName: nullableString(row.point_name),
    isAdmin: Boolean(row.is_admin),
    telegramAccount: nullableString(row.telegram_account),
    maxAccount: nullableString(row.max_account),
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

export const listEmployeeProfiles = listCourierProfiles;
export const getEmployeeProfile = getCourierProfile;
export const updateEmployeeProfile = updateCourierProfile;

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
