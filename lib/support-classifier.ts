export type SupportCategory =
  | "mobile_app"
  | "internet"
  | "gps"
  | "iiko"
  | "wrong_assignment"
  | "couriers_team"
  | "fiscal_receipt"
  | "stale_courier_data"
  | "sent_by_mistake"
  | "kladr"
  | "wrong_appeal"
  | "phone"
  | "cashier"
  | "hr"
  | "equipment"
  | "courier"
  | "feedback_missing"
  | "russia_outage"
  | "outdated_version"
  | "wrong_case"
  | "telegram"
  | "other";

export type SupportPriority = "low" | "normal" | "high" | "critical";

export type SupportClassification = {
  category: SupportCategory;
  categoryLabel: string;
  subcategory: string;
  priority: SupportPriority;
  confidence: number;
  requiredFields: SupportRequiredField[];
  autoReply: string | null;
};

export type SupportCategoryOption = {
  key: SupportCategory;
  label: string;
};

export const SUPPORT_CATEGORY_CATALOG: SupportCategoryOption[] = [
  { key: "mobile_app", label: "Мобильное приложение" },
  { key: "internet", label: "Интернет" },
  { key: "gps", label: "GPS" },
  { key: "iiko", label: "iiko" },
  { key: "wrong_assignment", label: "Неверное назначение" },
  { key: "couriers_team", label: "Проблемы с курьерами" },
  { key: "fiscal_receipt", label: "Фискальный чек" },
  { key: "stale_courier_data", label: "Неактуальные данные курьеров" },
  { key: "sent_by_mistake", label: "Отправил по ошибке" },
  { key: "kladr", label: "КЛАДР" },
  { key: "wrong_appeal", label: "Ошибочное обращение" },
  { key: "phone", label: "Проблемы с телефоном" },
  { key: "cashier", label: "Кассиры" },
  { key: "hr", label: "Отдел кадров" },
  { key: "equipment", label: "Оборудование" },
  { key: "courier", label: "Курьер" },
  { key: "feedback_missing", label: "Не получили обратную связь" },
  { key: "russia_outage", label: "Сбой в России" },
  { key: "outdated_version", label: "Не актуальная версия" },
  { key: "wrong_case", label: "Неправильный кейс" },
  { key: "telegram", label: "Проблема с Telegram" },
  { key: "other", label: "Другое" },
];

export type SupportRequiredField =
  | "phone"
  | "lastName"
  | "description"
  | "photoUrl"
  | "phoneModel"
  | "appVersion"
  | "os"
  | "location"
  | "carrier";

type Rule = {
  category: SupportCategory;
  label: string;
  subcategory: string;
  priority?: SupportPriority;
  requiredFields: SupportRequiredField[];
  patterns: RegExp[];
  autoReply?: string;
};

const baseRequired: SupportRequiredField[] = ["phone", "lastName", "description"];

const rules: Rule[] = [
  {
    category: "mobile_app",
    label: "Мобильное приложение",
    subcategory: "не работает приложение",
    priority: "high",
    requiredFields: ["phone", "lastName", "description", "photoUrl", "phoneModel"],
    patterns: [
      /не\s+работает\s+(?:мобильное\s+)?приложени/i,
      /приложени[еяю]/i,
      /не\s+загруж/i,
      /не\s+груз/i,
      /экран/i,
      /нет\s+связи\s+с\s+сервер/i,
      /ошибк\s*\d+/i,
    ],
    autoReply:
      "Проверяем обращение по мобильному приложению. Попробуйте перезапустить приложение и подключиться к Wi-Fi.",
  },
  {
    category: "internet",
    label: "Интернет",
    subcategory: "нет связи",
    requiredFields: ["phone", "lastName", "description", "location", "carrier"],
    patterns: [/интернет/i, /сеть/i, /мобильн.*связ/i, /не\s+ловит/i, /offline/i],
    autoReply:
      "Если возможно, подключитесь к Wi-Fi. Если проблема только с мобильным интернетом, укажите оператора связи и точку.",
  },
  {
    category: "gps",
    label: "GPS",
    subcategory: "геолокация",
    requiredFields: ["phone", "lastName", "description", "photoUrl", "phoneModel"],
    patterns: [/gps/i, /геолокац/i, /локац/i, /карта/i, /навиг/i],
  },
  {
    category: "iiko",
    label: "iiko",
    subcategory: "ошибка iiko",
    requiredFields: ["phone", "lastName", "description", "photoUrl"],
    patterns: [/iiko/i, /айко/i, /ико/i],
  },
  {
    category: "wrong_assignment",
    label: "Неверное назначение",
    subcategory: "заказ назначен неверно",
    requiredFields: baseRequired,
    patterns: [/неверн.*назнач/i, /не\s+мой\s+заказ/i, /чужой\s+заказ/i],
  },
  {
    category: "couriers_team",
    label: "Проблемы с курьерами",
    subcategory: "курьеры",
    requiredFields: baseRequired,
    patterns: [/проблем.*курьер/i, /курьер.*проблем/i],
  },
  {
    category: "fiscal_receipt",
    label: "Фискальный чек",
    subcategory: "чек",
    requiredFields: [...baseRequired, "photoUrl"],
    patterns: [/фискальн/i, /фиск/i, /чек/i],
  },
  {
    category: "stale_courier_data",
    label: "Неактуальные данные курьеров",
    subcategory: "данные курьера",
    requiredFields: baseRequired,
    patterns: [/неактуальн.*данн/i, /устарел.*данн/i, /старые\s+данн/i],
  },
  {
    category: "sent_by_mistake",
    label: "Отправил по ошибке",
    subcategory: "ошибочная отправка",
    priority: "low",
    requiredFields: baseRequired,
    patterns: [/отправил\s+по\s+ошиб/i, /ошибочно\s+отправ/i],
  },
  {
    category: "kladr",
    label: "КЛАДР",
    subcategory: "адрес",
    requiredFields: baseRequired,
    patterns: [/кладр/i, /kladr/i],
  },
  {
    category: "wrong_appeal",
    label: "Ошибочное обращение",
    subcategory: "ошибочное обращение",
    priority: "low",
    requiredFields: baseRequired,
    patterns: [/ошибочн.*обращ/i],
  },
  {
    category: "outdated_version",
    label: "Не актуальная версия",
    subcategory: "версия приложения",
    requiredFields: [...baseRequired, "appVersion"],
    patterns: [/не\s+актуальн.*верси/i, /старая\s+верси/i, /обновить\s+приложени/i],
  },
  {
    category: "wrong_case",
    label: "Неправильный кейс",
    subcategory: "неправильный кейс",
    priority: "low",
    requiredFields: baseRequired,
    patterns: [/не\s*правильн.*кейс/i, /неправильн.*кейс/i],
  },
  {
    category: "telegram",
    label: "Проблема с Telegram",
    subcategory: "telegram",
    requiredFields: baseRequired,
    patterns: [/telegram/i, /телеграм/i, /телеграмм/i],
  },
  {
    category: "russia_outage",
    label: "Сбой в России",
    subcategory: "сбой",
    requiredFields: baseRequired,
    patterns: [/сбой\s+в\s+росси/i, /массов.*сбой/i],
  },
  {
    category: "feedback_missing",
    label: "Не получили обратную связь",
    subcategory: "не получили ответ",
    requiredFields: baseRequired,
    patterns: [/нет\s+обратн/i, /не\s+ответили/i, /не\s+получил.*ответ/i],
  },
  {
    category: "hr",
    label: "Отдел кадров",
    subcategory: "кадры",
    requiredFields: baseRequired,
    patterns: [/кадр/i, /кл?адр/i, /документ/i, /отдел\s+кадр/i],
  },
  {
    category: "cashier",
    label: "Кассиры",
    subcategory: "кассир",
    requiredFields: baseRequired,
    patterns: [/кассир/i, /касса/i],
  },
  {
    category: "equipment",
    label: "Оборудование",
    subcategory: "оборудование",
    requiredFields: [...baseRequired, "photoUrl"],
    patterns: [/оборудован/i, /сканер/i, /терминал/i],
  },
  {
    category: "phone",
    label: "Проблемы с телефоном",
    subcategory: "устройство",
    requiredFields: [...baseRequired, "phoneModel"],
    patterns: [/проблем.*телефон/i, /телефон.*не/i, /устройств.*не/i],
  },
  {
    category: "courier",
    label: "Курьер",
    subcategory: "курьер",
    requiredFields: baseRequired,
    patterns: [/^курьер\b/i, /\bкурьер\s/i],
  },
];

const fallbackRule: Rule = {
  category: "other",
  label: "Другое",
  subcategory: "общее обращение",
  requiredFields: baseRequired,
  patterns: [],
};

const legacyCategoryMap: Record<string, SupportCategory> = {
  приложение: "mobile_app",
  "мобильное приложение": "mobile_app",
  интернет: "internet",
};

export function classifySupportText(text: string): SupportClassification {
  const normalized = text.trim();
  const matched = rules.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized)),
  );
  const rule = matched ?? fallbackRule;

  return {
    category: rule.category,
    categoryLabel: rule.label,
    subcategory: rule.subcategory,
    priority: rule.priority ?? "normal",
    confidence: matched ? 0.86 : 0.35,
    requiredFields: rule.requiredFields,
    autoReply: rule.autoReply ?? null,
  };
}

export function shouldStartSupportDialog(text: string): boolean {
  return rules.some((rule) => rule.patterns.some((pattern) => pattern.test(text)));
}

export function normalizeSupportText(text: string): string {
  return text
    .toLowerCase()
    .replace(/не\s+работает\s+(?:мобильное\s+)?приложени[еяю]?/gi, "")
    .replace(/[^а-яёa-z0-9\s]/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCategoryLabel(key: string | null | undefined): string {
  if (!key) return "Без категории";
  const found = SUPPORT_CATEGORY_CATALOG.find((item) => item.key === key);
  if (found) return found.label;
  const legacy = Object.entries(legacyCategoryMap).find(([label]) => label === key.toLowerCase());
  if (legacy) return getCategoryLabel(legacy[1]);
  return key;
}

export function resolveAppealCategoryKey(appeal: {
  classification: string | null;
  category: string | null;
}): SupportCategory | "other" {
  if (appeal.classification && isSupportCategory(appeal.classification)) {
    return appeal.classification;
  }
  const category = appeal.category?.trim().toLowerCase() ?? "";
  if (legacyCategoryMap[category]) return legacyCategoryMap[category];
  if (isSupportCategory(category)) return category;
  for (const item of SUPPORT_CATEGORY_CATALOG) {
    if (item.label.toLowerCase() === category) return item.key;
  }
  return "other";
}

function isSupportCategory(value: string): value is SupportCategory {
  return SUPPORT_CATEGORY_CATALOG.some((item) => item.key === value);
}

export function buildClassificationFromCategory(category: SupportCategory): SupportClassification {
  const option = SUPPORT_CATEGORY_CATALOG.find((item) => item.key === category);
  const rule = rules.find((item) => item.category === category);
  return {
    category,
    categoryLabel: option?.label ?? category,
    subcategory: rule?.subcategory ?? option?.label ?? category,
    priority: rule?.priority ?? "normal",
    confidence: 1,
    requiredFields: rule?.requiredFields ?? baseRequired,
    autoReply: rule?.autoReply ?? null,
  };
}

export type ClassificationSource = "auto" | "operator";

export function appealNeedsManualClassification(appeal: {
  classification: string | null;
  confidence: number | null;
  classificationSource?: ClassificationSource | null;
}): boolean {
  if (appeal.classificationSource === "operator") return false;
  if (!appeal.classification) return true;
  if (appeal.confidence == null) return true;
  return appeal.classification === "other" && appeal.confidence < 0.7;
}

export function buildTemplateReply(input: {
  categoryLabel: string;
  description: string;
  phoneModel?: string | null;
  appVersion?: string | null;
}) {
  const base =
    input.categoryLabel === "Мобильное приложение"
      ? "По мобильному приложению: перезапустите приложение, подключитесь к Wi-Fi и повторите вход. Если ошибка повторится, пришлите скриншот."
      : input.categoryLabel === "Интернет"
        ? "Проверьте связь: переключитесь на Wi-Fi или другую сеть. Если проблема только с мобильным интернетом, укажите оператора связи."
        : input.categoryLabel === "GPS"
          ? "Проверьте, что для приложения включена геолокация и режим высокой точности GPS. Перезапустите приложение и пришлите скрин карты, если проблема останется."
          : `По теме «${input.categoryLabel}» зафиксировали обращение. Следуйте стандартной инструкции для этой категории.`;

  const details = [
    input.phoneModel ? `Модель телефона: ${input.phoneModel}.` : "",
    input.appVersion ? `Версия приложения: ${input.appVersion}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [base, details].filter(Boolean).join(" ");
}
