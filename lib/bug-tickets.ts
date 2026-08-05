import postgres from "postgres";

import { addJiraComment, createJiraBugIssue } from "@/lib/jira-client";
import { analyzeBugReport } from "@/lib/bug-triage-ai";
import { getDeliveryPoint } from "@/lib/points";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { getRuntimeEnv } from "@/lib/runtime-env";
import type { SupportCategory, SupportPriority } from "@/lib/support-classifier";

// Same bug reported again is matched to an existing open Jira ticket within this
// window (same category + same delivery point) instead of creating a duplicate.
const DEDUP_WINDOW_DAYS = 14;

let sqlClient: postgres.Sql | null = null;
let schemaReady: Promise<void> | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) {
    throw new Error("MONITOR_DATABASE_URL is not configured");
  }
  sqlClient ??= postgres(url, { max: 3 });
  return sqlClient;
}

async function ensureBugTicketsSchema() {
  schemaReady ??= (async () => {
    await sql()`
      CREATE TABLE IF NOT EXISTS bug_tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        jira_key text NOT NULL,
        jira_url text NOT NULL,
        category text NOT NULL,
        point_id uuid,
        status text NOT NULL DEFAULT 'open',
        appeal_numbers integer[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

type OpenTicket = { id: string; jiraKey: string; jiraUrl: string };

async function findOpenTicket(
  category: SupportCategory,
  pointId: string | null,
): Promise<OpenTicket | null> {
  const rows = await sql()`
    SELECT id, jira_key, jira_url
    FROM bug_tickets
    WHERE status = 'open'
      AND category = ${category}
      AND point_id IS NOT DISTINCT FROM ${pointId}
      AND updated_at > now() - make_interval(days => ${DEDUP_WINDOW_DAYS})
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: String(row.id), jiraKey: String(row.jira_key), jiraUrl: String(row.jira_url) };
}

async function recordNewTicket(input: {
  jiraKey: string;
  jiraUrl: string;
  category: SupportCategory;
  pointId: string | null;
  appealNumber: number;
}) {
  await sql()`
    INSERT INTO bug_tickets (jira_key, jira_url, category, point_id, appeal_numbers)
    VALUES (${input.jiraKey}, ${input.jiraUrl}, ${input.category}, ${input.pointId}, ${[input.appealNumber]})
  `;
}

async function appendAppealToTicket(id: string, appealNumber: number) {
  await sql()`
    UPDATE bug_tickets
    SET appeal_numbers = array_append(appeal_numbers, ${appealNumber}),
        updated_at = now()
    WHERE id = ${id}
  `;
}

async function notifyFixbagChat(text: string) {
  const chatId = getRuntimeEnv("TELEGRAM_FIXBAG_CHAT_ID");
  if (!chatId) return;
  try {
    await sendTelegramMessage(chatId, text);
  } catch {
    // best-effort notification
  }
}

export async function triageAppealForJira(input: {
  appealNumber: number;
  description: string;
  category: SupportCategory;
  categoryLabel: string;
  priority: SupportPriority;
  pointId: string | null;
}): Promise<void> {
  try {
    const triage = await analyzeBugReport({
      description: input.description,
      category: input.category,
      categoryLabel: input.categoryLabel,
      priority: input.priority,
    });
    if (!triage.isBug) return;

    await ensureBugTicketsSchema();

    const pointName = input.pointId ? (await getDeliveryPoint(input.pointId))?.name ?? null : null;
    const contextLine = `Обращение №${input.appealNumber} (${input.categoryLabel}${pointName ? `, ${pointName}` : ""})`;

    const existing = await findOpenTicket(input.category, input.pointId);
    if (existing) {
      await addJiraComment(
        existing.jiraKey,
        `Повторное обращение.\n${contextLine}\n\n${triage.summary}`,
      );
      await appendAppealToTicket(existing.id, input.appealNumber);
      await notifyFixbagChat(
        `🔁 Ещё одно обращение по задаче ${existing.jiraKey}\n${existing.jiraUrl}\n\n${contextLine}\n${triage.summary}`,
      );
      return;
    }

    const issue = await createJiraBugIssue({
      summary: triage.title,
      description: `${triage.summary}\n\n${contextLine}\nИсточник: курьерский чат MAX.`,
      critical: triage.critical,
    });
    if (!issue) return;

    await recordNewTicket({
      jiraKey: issue.key,
      jiraUrl: issue.url,
      category: input.category,
      pointId: input.pointId,
      appealNumber: input.appealNumber,
    });

    const criticalTag = triage.critical ? "🔴 КРИТИЧНО. " : "🐛 ";
    await notifyFixbagChat(
      `${criticalTag}Новая задача ${issue.key}: ${triage.title}\n${issue.url}\n\n${contextLine}\n${triage.summary}\n\nВозьмите в работу.`,
    );
  } catch (error) {
    console.error("[bug-tickets] triage failed", error);
  }
}
