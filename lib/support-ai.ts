import { getRuntimeEnv } from "@/lib/runtime-env";
import { buildTemplateReply, type SupportClassification } from "@/lib/support-classifier";
import {
  analyzeProblemPhoto,
  findLearningMatches,
  getDeviceClusterSummary,
  pickBestLearnedReply,
  type DeviceClusterInfo,
  type LearningMatch,
} from "@/lib/support-learning";

export type AiSuggestion = {
  summary: string;
  suggestedReply: string;
  canAutoResolve: boolean;
  source: "local_model" | "rules" | "learned";
  photoAnalysis?: string | null;
  learnedFrom?: string | null;
  deviceCluster?: DeviceClusterInfo | null;
};

const OPERATOR_ONLY_CATEGORIES = new Set([
  "hr",
  "wrong_assignment",
  "feedback_missing",
  "equipment",
  "other",
  "courier",
  "couriers_team",
  "cashier",
  "iiko",
  "wrong_case",
  "wrong_appeal",
  "kladr",
  "fiscal_receipt",
  "stale_courier_data",
  "russia_outage",
  "telegram",
]);

export async function suggestSupportReply(input: {
  description: string;
  classification: SupportClassification;
  photoUrl?: string | null;
  courier?: {
    lastName?: string | null;
    phone?: string | null;
    phoneModel?: string | null;
    appVersion?: string | null;
    os?: string | null;
    notes?: string | null;
  } | null;
}): Promise<AiSuggestion> {
  const photoAnalysis = await analyzeProblemPhoto(input.photoUrl);
  const deviceCluster = await getDeviceClusterSummary({
    phoneModel: input.courier?.phoneModel,
    os: input.courier?.os,
    classification: input.classification.category,
  });
  const learningMatches = await findLearningMatches({
    classification: input.classification.category,
    issueText: input.description,
    phoneModel: input.courier?.phoneModel,
    os: input.courier?.os,
    photoAnalysis,
  });
  const learned = pickBestLearnedReply(learningMatches);

  if (learned) {
    const summary = buildSummary(input, photoAnalysis, deviceCluster, learningMatches);
    return {
      summary,
      suggestedReply: learned.replyText,
      canAutoResolve: resolveAutoHandling(
        input.classification,
        learned.replyText,
        true,
        "learned",
        learned.score,
        learned.usageCount,
        deviceCluster,
      ),
      source: "learned",
      photoAnalysis,
      learnedFrom: `${learned.sourceType}, использований: ${learned.usageCount}`,
      deviceCluster,
    };
  }

  const fallback = fallbackSuggestion(input, photoAnalysis, deviceCluster, learningMatches);
  const host = getRuntimeEnv("LOCAL_AI_URL") ?? "http://127.0.0.1:11434";
  const model = getRuntimeEnv("LOCAL_AI_MODEL") ?? "qwen2.5:1.5b-instruct";

  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: buildPrompt(input, photoAnalysis, deviceCluster, learningMatches),
        options: {
          temperature: 0.2,
          num_predict: 350,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as { response?: string };
    const parsed = parseModelResponse(data.response ?? "");
    if (!parsed) {
      return fallback;
    }

    const suggestedReply = parsed.reply || fallback.suggestedReply;
    return {
      summary: parsed.summary || fallback.summary,
      suggestedReply,
      canAutoResolve: resolveAutoHandling(
        input.classification,
        suggestedReply,
        parsed.canResolve,
        "local_model",
        undefined,
        undefined,
        deviceCluster,
      ),
      source: "local_model",
      photoAnalysis,
      deviceCluster,
    };
  } catch {
    return fallback;
  }
}

function fallbackSuggestion(
  input: {
    description: string;
    classification: SupportClassification;
    courier?: {
      phoneModel?: string | null;
      appVersion?: string | null;
    } | null;
  },
  photoAnalysis: string | null,
  deviceCluster: DeviceClusterInfo | null,
  learningMatches: LearningMatch[],
): AiSuggestion {
  const deviceReply = deviceCluster?.commonReply?.trim();
  const suggestedReply =
    deviceReply && deviceReply.length >= 20
      ? deviceReply
      : buildTemplateReply({
          categoryLabel: input.classification.categoryLabel,
          description: input.description,
          phoneModel: input.courier?.phoneModel,
          appVersion: input.courier?.appVersion,
        });

  return {
    summary: buildSummary(input, photoAnalysis, deviceCluster, learningMatches),
    suggestedReply,
    canAutoResolve: resolveAutoHandling(
      input.classification,
      suggestedReply,
      true,
      "rules",
      undefined,
      undefined,
      deviceCluster,
    ),
    source: "rules",
    photoAnalysis,
    deviceCluster,
  };
}

export function resolveAutoHandling(
  classification: SupportClassification,
  reply: string,
  modelCanResolve?: boolean,
  source: AiSuggestion["source"] = "rules",
  learnedScore?: number,
  learnedUsage?: number,
  deviceCluster?: DeviceClusterInfo | null,
) {
  if (modelCanResolve === false) return false;
  if (source === "learned" && learnedScore != null && learnedScore >= 0.72) {
    return true;
  }
  if (
    deviceCluster &&
    deviceCluster.uniqueCouriers >= 2 &&
    deviceCluster.totalAppeals >= 3 &&
    deviceCluster.commonReply &&
    source !== "rules"
  ) {
    return true;
  }
  if (OPERATOR_ONLY_CATEGORIES.has(classification.category)) {
    if (source === "learned" && learnedUsage != null && learnedUsage >= 3 && learnedScore != null && learnedScore >= 0.8) {
      return true;
    }
    return false;
  }
  if (classification.confidence < 0.7) return false;
  if (!reply.trim() || reply.trim().length < 24) return false;
  if (/оператор/i.test(reply) && /подключ|ожидай|передан/i.test(reply)) {
    return false;
  }
  return Boolean(classification.autoReply) || classification.confidence >= 0.86;
}

function buildSummary(
  input: {
    description: string;
    classification: SupportClassification;
    courier?: { phoneModel?: string | null } | null;
  },
  photoAnalysis: string | null,
  deviceCluster: DeviceClusterInfo | null,
  learningMatches: LearningMatch[],
) {
  const parts = [
    `${input.classification.categoryLabel}: ${input.description.slice(0, 120)}`,
    photoAnalysis ? `Фото: ${photoAnalysis.slice(0, 100)}` : "",
    deviceCluster
      ? `Устройство ${deviceCluster.phoneModel}: ${deviceCluster.totalAppeals} обращений у ${deviceCluster.uniqueCouriers} курьеров`
      : input.courier?.phoneModel
        ? `Устройство: ${input.courier.phoneModel}`
        : "",
    learningMatches.length > 0
      ? `Похожих кейсов в базе: ${learningMatches.length}`
      : "",
  ];
  return parts.filter(Boolean).join(". ");
}

function buildPrompt(
  input: {
    description: string;
    classification: SupportClassification;
    courier?: {
      lastName?: string | null;
      phone?: string | null;
      phoneModel?: string | null;
      appVersion?: string | null;
      os?: string | null;
      notes?: string | null;
    } | null;
  },
  photoAnalysis: string | null,
  deviceCluster: DeviceClusterInfo | null,
  learningMatches: LearningMatch[],
) {
  const examples = learningMatches
    .filter((match) => match.replyText)
    .slice(0, 3)
    .map(
      (match, index) =>
        `${index + 1}. Проблема: ${match.issuePattern.slice(0, 100)}; ответ: ${match.replyText.slice(0, 180)}`,
    )
    .join("\n");

  return [
    "Ты помощник оператора техподдержки курьеров.",
    "Используй похожие прошлые ответы операторов и типовые кейсы по тому же устройству.",
    "Ответь строго JSON без markdown: {\"summary\":\"...\",\"reply\":\"...\",\"canResolve\":true|false}.",
    "summary: короткое резюме проблемы до 160 символов.",
    "reply: готовый ответ курьеру в MAX от имени поддержки, до 500 символов.",
    "canResolve: true только если можно дать конкретную инструкцию без участия оператора.",
    "canResolve: false для кадров, оборудования, iiko, спорных кейсов и если нужна проверка оператором.",
    "",
    `Категория: ${input.classification.categoryLabel}`,
    `Подкатегория: ${input.classification.subcategory}`,
    `Приоритет: ${input.classification.priority}`,
    `Описание: ${input.description}`,
    photoAnalysis ? `Анализ фото: ${photoAnalysis}` : "Фото: нет или не распознано",
    deviceCluster
      ? `На модели ${deviceCluster.phoneModel} было ${deviceCluster.totalAppeals} похожих обращений от ${deviceCluster.uniqueCouriers} курьеров`
      : "",
    deviceCluster?.commonReply
      ? `Частый рабочий ответ для этого устройства: ${deviceCluster.commonReply.slice(0, 220)}`
      : "",
    examples ? `Похожие прошлые ответы:\n${examples}` : "",
    `Курьер: ${input.courier?.lastName ?? "не указан"}`,
    `Телефон: ${input.courier?.phone ?? "не указан"}`,
    `Модель телефона: ${input.courier?.phoneModel ?? "не указана"}`,
    `ОС: ${input.courier?.os ?? "не указана"}`,
    `Версия приложения: ${input.courier?.appVersion ?? "не указана"}`,
    `Пометки: ${input.courier?.notes ?? "нет"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseModelResponse(
  text: string,
): { summary: string; reply: string; canResolve?: boolean } | null {
  const trimmed = text.trim();
  const jsonText =
    trimmed.match(/\{[\s\S]*\}/)?.[0] ??
    trimmed
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

  try {
    const parsed = JSON.parse(jsonText) as {
      summary?: unknown;
      reply?: unknown;
      canResolve?: unknown;
    };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
      canResolve:
        typeof parsed.canResolve === "boolean" ? parsed.canResolve : undefined,
    };
  } catch {
    return null;
  }
}
