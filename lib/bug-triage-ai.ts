import { getRuntimeEnv } from "@/lib/runtime-env";
import type { SupportCategory, SupportPriority } from "@/lib/support-classifier";

export type BugTriageResult = {
  isBug: boolean;
  critical: boolean;
  title: string;
  summary: string;
};

// Categories that plausibly indicate a technical defect worth a Jira ticket,
// as opposed to HR/process/misdirected appeals. Used as a fallback when the
// local model call fails or returns something unparseable.
const TECHNICAL_CATEGORIES = new Set<SupportCategory>([
  "mobile_app",
  "internet",
  "gps",
  "iiko",
  "equipment",
  "outdated_version",
  "telegram",
  "russia_outage",
]);

function heuristicFallback(input: {
  description: string;
  category: SupportCategory;
  priority: SupportPriority;
}): BugTriageResult {
  return {
    isBug: TECHNICAL_CATEGORIES.has(input.category),
    critical: input.priority === "critical",
    title: input.description.slice(0, 80),
    summary: input.description,
  };
}

function parseTriageResponse(text: string): BugTriageResult | null {
  const bugYes = /IS_BUG:\s*(да|yes|true)/i.test(text);
  const bugNo = /IS_BUG:\s*(нет|no|false)/i.test(text);
  if (!bugYes && !bugNo) return null;

  const titleMatch = text.match(/TITLE:\s*(.+)/i);
  if (!titleMatch) return null;
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
  const critical = /CRITICAL:\s*(да|yes|true)/i.test(text);

  return {
    isBug: bugYes,
    critical,
    title: titleMatch[1].trim().slice(0, 120),
    summary: (summaryMatch?.[1] ?? text).trim().slice(0, 2000),
  };
}

export async function analyzeBugReport(input: {
  description: string;
  category: SupportCategory;
  categoryLabel: string;
  priority: SupportPriority;
}): Promise<BugTriageResult> {
  const fallback = heuristicFallback(input);
  const host = getRuntimeEnv("LOCAL_AI_URL") ?? "http://127.0.0.1:11434";
  const model = getRuntimeEnv("LOCAL_AI_MODEL") ?? "qwen2.5:1.5b-instruct";

  const prompt = `Ты — технический аналитик поддержки курьерского приложения Fuji.
По сообщению курьера определи, является ли это технической ошибкой (багом) приложения, сайта или оборудования, которую нужно завести в Jira разработчикам. Жалобы на людей, процессы, кадры, недоставленные заказы по вине курьера — это НЕ баг.

Категория обращения: ${input.categoryLabel}
Сообщение курьера: "${input.description}"

Ответь строго в этом формате, без лишнего текста:
IS_BUG: да|нет
CRITICAL: да|нет
TITLE: короткий заголовок задачи на русском (до 80 символов)
SUMMARY: краткое описание проблемы для разработчика (1-3 предложения)`;

  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt,
        options: { temperature: 0.1, num_predict: 220 },
      }),
      // Ollama needs time to load the model into memory after being idle —
      // this is a fire-and-forget background call, so a generous timeout
      // costs nothing but avoids falling back to the heuristic on cold start.
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { response?: string };
    const parsed = parseTriageResponse(data.response ?? "");
    if (!parsed) return fallback;
    // The rule-based classifier's priority is a more reliable "critical" signal
    // than a 1.5B model's own judgement — combine rather than trust AI alone.
    return { ...parsed, critical: parsed.critical || input.priority === "critical" };
  } catch {
    return fallback;
  }
}
