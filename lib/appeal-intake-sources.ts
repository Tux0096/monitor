export type AppealIntakeChannel = "telegram" | "max" | "manual" | "phone" | "visit";

export type AppealIntakeSource = {
  code: string;
  label: string;
  /** Короткая подпись для таблицы отчёта */
  shortLabel: string;
  channel: AppealIntakeChannel;
  /** Цвет маркера в отчёте (tailwind) */
  badgeClass: string;
  /** Автоподстановка по названию темы Telegram Forum */
  autoTopicNames?: string[];
};

export const APPEAL_INTAKE_SOURCES: AppealIntakeSource[] = [
  {
    code: "phone",
    label: "Телефонный звонок",
    shortLabel: "Телефон",
    channel: "phone",
    badgeClass: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  },
  {
    code: "visit",
    label: "Личный визит",
    shortLabel: "Визит",
    channel: "visit",
    badgeClass: "bg-rose-500/15 text-rose-200 border-rose-500/30",
  },
  {
    code: "telegram_it_chat",
    label: "Чат операторы IT",
    shortLabel: "IT чат",
    channel: "telegram",
    badgeClass: "bg-sky-500/15 text-sky-200 border-sky-500/30",
    autoTopicNames: ["it заявки", "айти заявки", "операторы it", "операторы и it"],
  },
  {
    code: "telegram_tech_requests",
    label: "Чат технические заявки",
    shortLabel: "Тех. заявки",
    channel: "telegram",
    badgeClass: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
    autoTopicNames: ["технические заявки", "техническая заявка"],
  },
  {
    code: "telegram_support_chat",
    label: "Чат технической поддержки",
    shortLabel: "Техподдержка",
    channel: "telegram",
    badgeClass: "bg-blue-500/15 text-blue-200 border-blue-500/30",
  },
  {
    code: "message",
    label: "Сообщение",
    shortLabel: "Сообщение",
    channel: "manual",
    badgeClass: "bg-indigo-500/15 text-indigo-200 border-indigo-500/30",
  },
  {
    code: "max_courier",
    label: "MAX · обращения курьеров",
    shortLabel: "MAX",
    channel: "max",
    badgeClass: "bg-violet-500/15 text-violet-200 border-violet-500/30",
  },
  {
    code: "manual",
    label: "Вручную",
    shortLabel: "Вручную",
    channel: "manual",
    badgeClass: "bg-zinc-500/15 text-zinc-300 border-zinc-600",
  },
];

const sourceByCode = new Map(APPEAL_INTAKE_SOURCES.map((item) => [item.code, item]));

export function listAppealIntakeSources(): AppealIntakeSource[] {
  return APPEAL_INTAKE_SOURCES;
}

export function getAppealIntakeSource(code: string | null | undefined): AppealIntakeSource | null {
  if (!code) return null;
  return sourceByCode.get(code) ?? null;
}

export function getAppealIntakeSourceLabel(code: string | null | undefined): string {
  return getAppealIntakeSource(code)?.label ?? code ?? "—";
}

export function getAppealIntakeSourceShortLabel(code: string | null | undefined): string {
  const source = getAppealIntakeSource(code);
  if (source) return source.shortLabel;
  return getAppealIntakeSourceLabel(code);
}

export function normalizeTopicName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveIntakeSourceCode(input: {
  channel?: "max" | "telegram" | "manual" | null;
  topicName?: string | null;
  manualCode?: string | null;
}): string {
  if (input.manualCode && sourceByCode.has(input.manualCode)) {
    return input.manualCode;
  }

  const topic = normalizeTopicName(input.topicName);
  if (topic) {
    for (const source of APPEAL_INTAKE_SOURCES) {
      if (!source.autoTopicNames?.length) continue;
      if (
        source.autoTopicNames.some(
          (name) => topic === name || topic.includes(name) || name.includes(topic),
        )
      ) {
        return source.code;
      }
    }
  }

  if (input.channel === "max") return "max_courier";
  if (input.channel === "telegram") return "telegram_support_chat";
  return "manual";
}

export const APPEAL_RESOLUTION_METHODS = [
  { code: "remote", label: "удаленно", badgeClass: "bg-emerald-500/15 text-emerald-200" },
  { code: "onsite", label: "выезд", badgeClass: "bg-rose-500/15 text-rose-200" },
] as const;

export type AppealResolutionMethod = (typeof APPEAL_RESOLUTION_METHODS)[number]["code"];

export function getResolutionMethodLabel(code: string | null | undefined): string {
  const found = APPEAL_RESOLUTION_METHODS.find((item) => item.code === code);
  return found?.label ?? code ?? "—";
}

export function formatReportDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return "—";
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function durationSeconds(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 1000);
}
