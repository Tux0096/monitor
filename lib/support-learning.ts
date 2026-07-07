import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { isLocalAppealPhotoPath, resolveLocalAppealPhotoPath } from "@/lib/appeal-uploads";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { normalizeSupportText } from "@/lib/support-classifier";

export type LearningAppealInput = {
  id: string;
  classification: string | null;
  category: string | null;
  subcategory: string | null;
  descriptionNormalized: string | null;
  issueText: string;
  phoneModel: string | null;
  os: string | null;
  appVersion: string | null;
  photoUrl: string | null;
  photoAnalysis?: string | null;
};

export type LearningMatch = {
  id: string;
  sourceType: string;
  replyText: string;
  issuePattern: string;
  photoAnalysis: string | null;
  phoneModel: string | null;
  usageCount: number;
  score: number;
};

export type DeviceClusterInfo = {
  phoneModel: string;
  os: string | null;
  classification: string;
  totalAppeals: number;
  uniqueCouriers: number;
  commonReply: string | null;
  recentIssues: string[];
};

let sqlClient: postgres.Sql | null = null;

function sql() {
  const url = getRuntimeEnv("MONITOR_DATABASE_URL");
  if (!url) throw new Error("MONITOR_DATABASE_URL is not configured");
  sqlClient ??= postgres(url, { max: 5 });
  return sqlClient;
}

export async function ensureSupportLearningSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS support_knowledge (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type text NOT NULL,
      appeal_id uuid,
      classification text,
      category text,
      subcategory text,
      phone_model text,
      os text,
      app_version text,
      issue_pattern text NOT NULL DEFAULT '',
      photo_analysis text,
      reply_text text NOT NULL,
      usage_count integer NOT NULL DEFAULT 1,
      success_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS support_knowledge_class_device_idx
    ON support_knowledge (classification, phone_model)
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS support_knowledge_issue_idx
    ON support_knowledge (issue_pattern)
  `;
}

export async function analyzeProblemPhoto(photoUrl: string | null | undefined) {
  if (!photoUrl?.trim()) return null;
  const host = getRuntimeEnv("LOCAL_AI_URL") ?? "http://127.0.0.1:11434";
  const model =
    getRuntimeEnv("LOCAL_AI_VISION_MODEL") ?? "moondream";

  try {
    let buffer: Buffer | null = null;
    if (isLocalAppealPhotoPath(photoUrl)) {
      const filePath = resolveLocalAppealPhotoPath(photoUrl);
      if (filePath) {
        buffer = await readFile(filePath);
      }
    } else {
      const imageResponse = await fetch(photoUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!imageResponse.ok) return null;
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    }
    if (!buffer || buffer.length < 512) return null;
    const base64 = buffer.toString("base64");

    const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt:
          "Опиши проблему на скриншоте техподдержки курьера: тип ошибки, текст ошибки, экран приложения. " +
          "Ответ на русском, до 220 символов, без markdown.",
        images: [base64],
        options: { temperature: 0.1, num_predict: 220 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { response?: string };
    const text = data.response?.trim();
    return text && text.length >= 8 ? text.slice(0, 400) : null;
  } catch {
    return null;
  }
}

export async function saveAppealPhotoAnalysis(appealId: string, photoAnalysis: string | null) {
  if (!photoAnalysis) return;
  await ensureSupportLearningSchema();
  await sql().unsafe(
    `ALTER TABLE support_appeals ADD COLUMN IF NOT EXISTS photo_analysis text`,
  );
  await sql()`
    UPDATE support_appeals
    SET photo_analysis = ${photoAnalysis}, updated_at = now()
    WHERE id = ${appealId}
  `;
}

export async function ingestOperatorReply(appeal: LearningAppealInput, replyText: string) {
  const text = replyText.trim();
  if (text.length < 12) return;
  await upsertKnowledge({
    sourceType: "operator",
    appealId: appeal.id,
    appeal,
    replyText: text,
    incrementSuccess: true,
  });
}

export async function ingestSuccessfulAutoReply(appeal: LearningAppealInput, replyText: string) {
  const text = replyText.trim();
  if (text.length < 12) return;
  await upsertKnowledge({
    sourceType: "ai",
    appealId: appeal.id,
    appeal,
    replyText: text,
    incrementSuccess: true,
  });
}

export async function ingestPhotoPattern(appeal: LearningAppealInput, photoAnalysis: string) {
  if (!photoAnalysis.trim()) return;
  await upsertKnowledge({
    sourceType: "photo",
    appealId: appeal.id,
    appeal: { ...appeal, photoAnalysis },
    replyText: photoAnalysis,
    incrementSuccess: false,
  });
}

export async function findLearningMatches(input: {
  classification: string;
  issueText: string;
  phoneModel?: string | null;
  os?: string | null;
  photoAnalysis?: string | null;
}): Promise<LearningMatch[]> {
  await ensureSupportLearningSchema();
  const issuePattern = normalizeSupportText(input.issueText);
  const rows = await sql()`
    SELECT *
    FROM support_knowledge
    WHERE classification = ${input.classification}
      AND source_type IN ('operator', 'ai', 'photo')
    ORDER BY usage_count DESC, updated_at DESC
    LIMIT 120
  `;

  const phoneModel = normalizeDevice(input.phoneModel);
  const matches: LearningMatch[] = [];

  for (const row of rows) {
    const entryPhone = normalizeDevice(nullableString(row.phone_model));
    const replyText = String(row.reply_text ?? "");
    if (row.source_type === "photo" && replyText.length < 12) continue;

    let score = textSimilarity(issuePattern, String(row.issue_pattern ?? ""));
    if (phoneModel && entryPhone && phoneModel === entryPhone) score += 0.18;
    if (input.os && nullableString(row.os) === input.os) score += 0.05;
    if (input.photoAnalysis && row.photo_analysis) {
      score += textSimilarity(
        normalizeSupportText(input.photoAnalysis),
        normalizeSupportText(String(row.photo_analysis)),
      ) * 0.35;
    }
    if (row.source_type === "operator") score += 0.08;
    score += Math.min(Number(row.usage_count ?? 1) * 0.03, 0.15);

    if (score < 0.45) continue;
    matches.push({
      id: String(row.id),
      sourceType: String(row.source_type),
      replyText: row.source_type === "photo" ? "" : replyText,
      issuePattern: String(row.issue_pattern ?? ""),
      photoAnalysis: nullableString(row.photo_analysis),
      phoneModel: nullableString(row.phone_model),
      usageCount: Number(row.usage_count ?? 1),
      score,
    });
  }

  return matches
    .filter((match) => match.sourceType !== "photo" || match.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function getDeviceClusterSummary(input: {
  phoneModel?: string | null;
  os?: string | null;
  classification: string;
}): Promise<DeviceClusterInfo | null> {
  const phoneModel = normalizeDevice(input.phoneModel);
  if (!phoneModel) return null;

  await sql().unsafe(
    `ALTER TABLE support_appeals ADD COLUMN IF NOT EXISTS photo_analysis text`,
  );

  const stats = await sql()`
    SELECT
      count(*)::int AS total,
      count(DISTINCT max_user_id)::int AS couriers
    FROM support_appeals
    WHERE lower(coalesce(phone_model, '')) = lower(${phoneModel})
      AND classification = ${input.classification}
      AND created_at >= now() - INTERVAL '120 days'
  `;
  const totalAppeals = Number(stats[0]?.total ?? 0);
  if (totalAppeals === 0) return null;

  const recent = await sql()`
    SELECT issue_text, result_text, operator_reply
    FROM support_appeals
    WHERE lower(coalesce(phone_model, '')) = lower(${phoneModel})
      AND classification = ${input.classification}
      AND created_at >= now() - INTERVAL '120 days'
    ORDER BY created_at DESC
    LIMIT 6
  `;

  const knowledge = await sql()`
    SELECT reply_text, usage_count
    FROM support_knowledge
    WHERE lower(coalesce(phone_model, '')) = lower(${phoneModel})
      AND classification = ${input.classification}
      AND source_type IN ('operator', 'ai')
    ORDER BY usage_count DESC, updated_at DESC
    LIMIT 1
  `;

  return {
    phoneModel,
    os: input.os ?? null,
    classification: input.classification,
    totalAppeals,
    uniqueCouriers: Number(stats[0]?.couriers ?? 0),
    commonReply: knowledge[0] ? String(knowledge[0].reply_text) : null,
    recentIssues: recent.map((row) =>
      String(row.issue_text ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
    ),
  };
}

export function pickBestLearnedReply(matches: LearningMatch[]): LearningMatch | null {
  const operatorMatches = matches.filter(
    (match) => match.sourceType !== "photo" && match.replyText.length >= 20,
  );
  const best = operatorMatches[0];
  if (!best) return null;
  if (best.sourceType === "operator" && best.usageCount >= 2 && best.score >= 0.72) {
    return best;
  }
  if (best.score >= 0.84 && best.usageCount >= 1) return best;
  return null;
}

async function upsertKnowledge(input: {
  sourceType: string;
  appealId: string;
  appeal: LearningAppealInput;
  replyText: string;
  incrementSuccess: boolean;
}) {
  await ensureSupportLearningSchema();
  const issuePattern =
    input.appeal.descriptionNormalized ??
    normalizeSupportText(input.appeal.issueText);
  const phoneModel = normalizeDevice(input.appeal.phoneModel);

  const existing = await sql()`
    SELECT id, usage_count, success_count
    FROM support_knowledge
    WHERE source_type = ${input.sourceType}
      AND classification = ${input.appeal.classification}
      AND coalesce(phone_model, '') = coalesce(${phoneModel}, '')
      AND issue_pattern = ${issuePattern}
      AND reply_text = ${input.replyText}
    LIMIT 1
  `;

  if (existing[0]) {
    await sql()`
      UPDATE support_knowledge
      SET usage_count = usage_count + 1,
          success_count = success_count + ${input.incrementSuccess ? 1 : 0},
          photo_analysis = coalesce(${input.appeal.photoAnalysis ?? null}, photo_analysis),
          updated_at = now()
      WHERE id = ${existing[0].id}
    `;
    return;
  }

  await sql()`
    INSERT INTO support_knowledge (
      source_type,
      appeal_id,
      classification,
      category,
      subcategory,
      phone_model,
      os,
      app_version,
      issue_pattern,
      photo_analysis,
      reply_text,
      success_count
    )
    VALUES (
      ${input.sourceType},
      ${input.appealId},
      ${input.appeal.classification},
      ${input.appeal.category},
      ${input.appeal.subcategory},
      ${phoneModel},
      ${input.appeal.os},
      ${input.appeal.appVersion},
      ${issuePattern},
      ${input.appeal.photoAnalysis ?? null},
      ${input.replyText},
      ${input.incrementSuccess ? 1 : 0}
    )
  `;
}

function textSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) return 0.9;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 3));
  const bTokens = b.split(" ").filter((token) => token.length > 3);
  if (aTokens.size === 0 || bTokens.length === 0) return 0;
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.length);
}

function normalizeDevice(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}
