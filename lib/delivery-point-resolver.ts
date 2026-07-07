import { normalizeDeliveryPointName } from "@/lib/delivery-points-catalog";
import type { DeliveryPoint } from "@/lib/points";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type ResolvedDeliveryPoint = {
  id: string;
  name: string;
  confidence: number;
  source: "alias" | "token" | "profile" | "ai";
};

type PointAliasRule = {
  aliases: string[];
  matchName: (normalizedName: string) => boolean;
};

let pointsCache: { loadedAt: number; points: DeliveryPoint[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

const POINT_ALIAS_RULES: PointAliasRule[] = [
  rule(["лукачи", "лукач", "лукачева"], "лукачева"),
  rule(["люликова", "димитр 110", "димитрова 110"], "димитр. 110"),
  rule(["димитр 131"], "димитр 131"),
  rule(["скворцов 131"], "димитр 131"),
  rule(["революц", "революционная", "скворцов 70"], "революц. 70"),
  rule(["лазо", "крохмалев", "сергей лазо"], "лазо 24"),
  rule(["новокуйб", "новокуйбышевск", "ковалкин"], "новокуйб"),
  rule(["донского", "кудряшов"], "д.донского"),
  rule(["молодогв", "молодогвардейская", "максимова"], "молодогв"),
  rule(["физкультурная", "иконникова"], "физкультурная"),
  rule(["яшина", "льва яшина"], "льва яшина"),
  rule(["дыбенко", "кошкарова"], "дыбенко"),
  rule(["долотный", "панарин"], "долотный"),
  rule(["крутые ключи"], "крутые ключи"),
  rule(["фабрика п", "фабрика(п)", "фабрика п)"], "фабрика(п)"),
  rule(["карла маркса", "сайгина"], "карла маркса"),
  rule(["стара загора", "сидоренко"], "стара загора"),
  rule(["коммунист", "исаева"], "коммунист"),
  rule(["автостроителей"], "автостроителей"),
  rule(["николаевск"], "николаевск"),
  rule(["просека", "кривотулова"], "просека"),
  rule(["ст загора", "ст.загора", "латухина"], "ст.загора"),
  rule(["ново-садов", "новосадов", "ново садов", "новосадовая"], "ново-садов"),
  rule(["осетинская", "прохорова"], "осетинская"),
  rule(["ленинградск", "рожков"], "ленинградск"),
  rule(["бухгалтерия"], "бухгалтерия"),
  rule(["центральный офис", "цо", "центр офис"], "центральный офис"),
  rule(["колл центр", "колл-центр", "кц", "колцентр"], "колл центр"),
  rule(["склад"], "склад"),
  {
    aliases: ["фабрика"],
    matchName: (normalizedName) => normalizedName === "фабрика",
  },
];

function rule(aliases: string[], nameNeedle: string): PointAliasRule {
  const needle = normalizePointText(nameNeedle);
  return {
    aliases,
    matchName: (normalizedName) => normalizedName.includes(needle),
  };
}

function normalizePointText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[().,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadPoints(): Promise<DeliveryPoint[]> {
  const now = Date.now();
  if (pointsCache && now - pointsCache.loadedAt < CACHE_MS) {
    return pointsCache.points;
  }
  const { ensureAppealsSchema } = await import("@/lib/appeals");
  const { listDeliveryPoints } = await import("@/lib/points");
  await ensureAppealsSchema();
  const points = await listDeliveryPoints(true);
  pointsCache = { loadedAt: now, points };
  return points;
}

function findPointByRule(
  points: DeliveryPoint[],
  ruleItem: PointAliasRule,
): DeliveryPoint | null {
  return points.find((point) => ruleItem.matchName(normalizePointText(point.name))) ?? null;
}

function scorePoint(point: DeliveryPoint, text: string): number {
  const normalizedText = normalizePointText(text);
  const normalizedName = normalizePointText(point.name);
  let score = 0;

  if (normalizedText.includes(normalizedName)) {
    score += 1;
  }

  const tokens = normalizedName
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 || /^\d+$/.test(token));

  for (const token of tokens) {
    if (normalizedText.includes(token)) {
      score += token.length >= 6 ? 0.45 : 0.3;
    }
  }

  return score;
}

function resolveByAliases(text: string, points: DeliveryPoint[]): ResolvedDeliveryPoint | null {
  const normalizedText = normalizePointText(text);
  const sortedRules = [...POINT_ALIAS_RULES].sort(
    (a, b) =>
      Math.max(...b.aliases.map((alias) => alias.length)) -
      Math.max(...a.aliases.map((alias) => alias.length)),
  );

  for (const aliasRule of sortedRules) {
    for (const alias of aliasRule.aliases) {
      const normalizedAlias = normalizePointText(alias);
      if (!normalizedAlias || !normalizedText.includes(normalizedAlias)) continue;
      const point = findPointByRule(points, aliasRule);
      if (!point) continue;
      return {
        id: point.id,
        name: point.name,
        confidence: normalizedAlias.length >= 5 ? 0.95 : 0.88,
        source: "alias",
      };
    }
  }

  return null;
}

function resolveByTokens(text: string, points: DeliveryPoint[]): ResolvedDeliveryPoint | null {
  const scored = points
    .map((point) => ({ point, score: scorePoint(point, text) }))
    .filter((item) => item.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return null;
  if (second && best.score - second.score < 0.2) return null;

  return {
    id: best.point.id,
    name: best.point.name,
    confidence: Math.min(0.84, 0.65 + best.score * 0.15),
    source: "token",
  };
}

async function resolveByAi(
  text: string,
  points: DeliveryPoint[],
): Promise<ResolvedDeliveryPoint | null> {
  const host = getRuntimeEnv("LOCAL_AI_URL") ?? "http://127.0.0.1:11434";
  const model = getRuntimeEnv("LOCAL_AI_MODEL") ?? "qwen2.5:1.5b-instruct";
  const catalog = points
    .map((point, index) => `${index + 1}. ${point.name} | id=${point.id}`)
    .join("\n");

  const prompt = [
    "Определи точку выдачи Fuji по сообщению курьера.",
    "Ответь строго JSON: {\"pointId\":\"uuid|null\",\"confidence\":0..1}.",
    "pointId=null, если точка не указана или неясна.",
    "Используй только id из списка.",
    "Примеры: «лукачи» -> Лукачева; «димитр 110» -> Димитр. 110; «яшина» -> Тольятти Льва Яшина.",
    "",
    "Список точек:",
    catalog,
    "",
    `Сообщение: ${text}`,
  ].join("\n");

  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt,
        options: { temperature: 0.1, num_predict: 120 },
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { response?: string };
    const parsed = parseAiPointResponse(data.response ?? "", points);
    if (!parsed) return null;
    return { ...parsed, source: "ai" };
  } catch {
    return null;
  }
}

function parseAiPointResponse(
  raw: string,
  points: DeliveryPoint[],
): Omit<ResolvedDeliveryPoint, "source"> | null {
  const jsonText =
    raw.trim().match(/\{[\s\S]*\}/)?.[0] ??
    raw
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as { pointId?: unknown; confidence?: unknown };
    const pointId =
      typeof parsed.pointId === "string" && parsed.pointId.trim() && parsed.pointId !== "null"
        ? parsed.pointId.trim()
        : null;
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : pointId
          ? 0.75
          : 0;

    if (!pointId) return null;
    const point = points.find((item) => item.id === pointId);
    if (!point) return null;
    if (confidence < 0.55) return null;

    return { id: point.id, name: point.name, confidence };
  } catch {
    return null;
  }
}

export async function resolveDeliveryPointFromText(
  text: string,
  profilePointId?: string | null,
): Promise<ResolvedDeliveryPoint | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    if (!profilePointId) return null;
    const points = await loadPoints();
    const profilePoint = points.find((point) => point.id === profilePointId);
    return profilePoint
      ? { id: profilePoint.id, name: profilePoint.name, confidence: 0.5, source: "profile" }
      : null;
  }

  const points = await loadPoints();
  if (points.length === 0) return null;

  const aliasMatch = resolveByAliases(trimmed, points);
  if (aliasMatch) return aliasMatch;

  const tokenMatch = resolveByTokens(trimmed, points);
  if (tokenMatch) return tokenMatch;

  const aiMatch = await resolveByAi(trimmed, points);
  if (aiMatch) return aiMatch;

  if (profilePointId) {
    const profilePoint = points.find((point) => point.id === profilePointId);
    if (profilePoint) {
      return {
        id: profilePoint.id,
        name: profilePoint.name,
        confidence: 0.5,
        source: "profile",
      };
    }
  }

  return null;
}

export function deliveryPointNamesMatch(a: string, b: string): boolean {
  return normalizeDeliveryPointName(a) === normalizeDeliveryPointName(b);
}
