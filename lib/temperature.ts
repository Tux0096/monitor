export type TemperatureStatus = "normal" | "warning" | "critical" | "offline";

export type EquipmentKind =
  | "refrigerator"
  | "saladette"
  | "freezer"
  | "display_cold"
  | "display_freezer"
  | "blast_chiller";

export type SiteId = "sz60" | "sz124";

export type Site = {
  id: SiteId;
  name: string;
};

export type EquipmentTemplate = {
  id: string;
  siteId: SiteId;
  name: string;
  kind: EquipmentKind;
  zone: string;
  minTemp: number;
  maxTemp: number;
};

export type EquipmentReading = EquipmentTemplate & {
  temperature: number;
  status: TemperatureStatus;
  updatedAt: string;
  previousTemperature: number;
};

export const SITES: Site[] = [
  { id: "sz60", name: "Стара Загора 60" },
  { id: "sz124", name: "Стара Загора 124" },
];

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  refrigerator: "Холодильник",
  saladette: "Саладет",
  freezer: "Морозильная камера",
  display_cold: "Охлаждаемая витрина",
  display_freezer: "Морозильная витрина",
  blast_chiller: "Шок-фризер",
};

const KIND_RANGES: Record<EquipmentKind, { min: number; max: number }> = {
  refrigerator: { min: 2, max: 6 },
  saladette: { min: 2, max: 6 },
  freezer: { min: -22, max: -18 },
  display_cold: { min: 0, max: 4 },
  display_freezer: { min: -20, max: -16 },
  blast_chiller: { min: -35, max: -30 },
};

const SZ60_EQUIPMENT: Omit<EquipmentTemplate, "siteId">[] = [
  { id: "sz60-01", name: "Холодильник кухня", kind: "refrigerator", zone: "Горячий цех", minTemp: 2, maxTemp: 6 },
  { id: "sz60-02", name: "Холодильник заготовки", kind: "refrigerator", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz60-03", name: "Саладет линия", kind: "saladette", zone: "Раздача", minTemp: 2, maxTemp: 6 },
  { id: "sz60-04", name: "Морозильная камера основная", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz60-05", name: "Морозильная камера доп.", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz60-06", name: "Витрина бар", kind: "display_cold", zone: "Бар", minTemp: 0, maxTemp: 4 },
  { id: "sz60-07", name: "Морозильный ларь фрит", kind: "display_freezer", zone: "Горячий цех", minTemp: -20, maxTemp: -16 },
  { id: "sz60-08", name: "Шок-фризер", kind: "blast_chiller", zone: "Горячий цех", minTemp: -35, maxTemp: -30 },
  { id: "sz60-09", name: "Холодильник напитки", kind: "refrigerator", zone: "Бар", minTemp: 2, maxTemp: 6 },
  { id: "sz60-10", name: "Саладет суши-бар", kind: "saladette", zone: "Суши-бар", minTemp: 2, maxTemp: 6 },
  { id: "sz60-11", name: "Витрина кондитерская", kind: "display_cold", zone: "Кондитерка", minTemp: 0, maxTemp: 4 },
  { id: "sz60-12", name: "Морозильная камера рыба", kind: "freezer", zone: "Суши-бар", minTemp: -22, maxTemp: -18 },
  { id: "sz60-13", name: "Холодильник молочка", kind: "refrigerator", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz60-14", name: "Саладет овощи", kind: "saladette", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz60-15", name: "Камера охлаждения мясо", kind: "refrigerator", zone: "Заготовки", minTemp: 0, maxTemp: 4 },
  { id: "sz60-16", name: "Морозильная камера склад", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz60-17", name: "Холодильник десерты", kind: "refrigerator", zone: "Кондитерка", minTemp: 2, maxTemp: 6 },
  { id: "sz60-18", name: "Витрина готовые блюда", kind: "display_cold", zone: "Раздача", minTemp: 0, maxTemp: 4 },
  { id: "sz60-19", name: "Ларь охлаждаемый напитки", kind: "display_cold", zone: "Зал", minTemp: 0, maxTemp: 4 },
  { id: "sz60-20", name: "Морозильная витрина", kind: "display_freezer", zone: "Раздача", minTemp: -20, maxTemp: -16 },
];

const SZ124_EQUIPMENT: Omit<EquipmentTemplate, "siteId">[] = [
  { id: "sz124-01", name: "Холодильник кухня", kind: "refrigerator", zone: "Горячий цех", minTemp: 2, maxTemp: 6 },
  { id: "sz124-02", name: "Холодильник заготовки", kind: "refrigerator", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz124-03", name: "Саладет линия", kind: "saladette", zone: "Раздача", minTemp: 2, maxTemp: 6 },
  { id: "sz124-04", name: "Морозильная камера основная", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz124-05", name: "Морозильная камера доп.", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz124-06", name: "Витрина бар", kind: "display_cold", zone: "Бар", minTemp: 0, maxTemp: 4 },
  { id: "sz124-07", name: "Морозильный ларь фрит", kind: "display_freezer", zone: "Горячий цех", minTemp: -20, maxTemp: -16 },
  { id: "sz124-08", name: "Шок-фризер", kind: "blast_chiller", zone: "Горячий цех", minTemp: -35, maxTemp: -30 },
  { id: "sz124-09", name: "Холодильник напитки", kind: "refrigerator", zone: "Бар", minTemp: 2, maxTemp: 6 },
  { id: "sz124-10", name: "Саладет суши-бар", kind: "saladette", zone: "Суши-бар", minTemp: 2, maxTemp: 6 },
  { id: "sz124-11", name: "Витрина кондитерская", kind: "display_cold", zone: "Кондитерка", minTemp: 0, maxTemp: 4 },
  { id: "sz124-12", name: "Морозильная камера рыба", kind: "freezer", zone: "Суши-бар", minTemp: -22, maxTemp: -18 },
  { id: "sz124-13", name: "Холодильник молочка", kind: "refrigerator", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz124-14", name: "Саладет овощи", kind: "saladette", zone: "Заготовки", minTemp: 2, maxTemp: 6 },
  { id: "sz124-15", name: "Камера охлаждения мясо", kind: "refrigerator", zone: "Заготовки", minTemp: 0, maxTemp: 4 },
  { id: "sz124-16", name: "Морозильная камера склад", kind: "freezer", zone: "Склад", minTemp: -22, maxTemp: -18 },
  { id: "sz124-17", name: "Холодильник десерты", kind: "refrigerator", zone: "Кондитерка", minTemp: 2, maxTemp: 6 },
  { id: "sz124-18", name: "Витрина готовые блюда", kind: "display_cold", zone: "Раздача", minTemp: 0, maxTemp: 4 },
  { id: "sz124-19", name: "Ларь охлаждаемый напитки", kind: "display_cold", zone: "Зал", minTemp: 0, maxTemp: 4 },
  { id: "sz124-20", name: "Морозильная витрина", kind: "display_freezer", zone: "Раздача", minTemp: -20, maxTemp: -16 },
];

export const EQUIPMENT_TEMPLATES: EquipmentTemplate[] = [
  ...SZ60_EQUIPMENT.map((item) => ({ ...item, siteId: "sz60" as SiteId })),
  ...SZ124_EQUIPMENT.map((item) => ({ ...item, siteId: "sz124" as SiteId })),
];

/** Демо-смещения: несколько единиц сразу в warning/critical/offline */
const DEMO_OFFSETS: Record<string, number> = {
  "sz60-03": 2.5,
  "sz60-12": 4,
  "sz60-07": -2,
  "sz124-04": 3,
  "sz124-10": 1.8,
  "sz124-18": -1.5,
};

const OFFLINE_IDS = new Set(["sz124-16"]);

export function formatTemp(value: number): string {
  return `${value.toFixed(1)}°C`;
}

export function formatRange(min: number, max: number): string {
  return `${min}…${max} °C`;
}

export function computeStatus(
  temperature: number,
  minTemp: number,
  maxTemp: number,
  offline = false,
): TemperatureStatus {
  if (offline) return "offline";
  if (temperature < minTemp || temperature > maxTemp) return "critical";
  const span = maxTemp - minTemp;
  const warningMargin = Math.max(span * 0.15, 0.8);
  if (temperature < minTemp + warningMargin || temperature > maxTemp - warningMargin) {
    return "warning";
  }
  return "normal";
}

function midpoint(min: number, max: number): number {
  return (min + max) / 2;
}

function initialTemperature(template: EquipmentTemplate): number {
  const offset = DEMO_OFFSETS[template.id] ?? 0;
  const base = midpoint(template.minTemp, template.maxTemp) + offset;
  const jitter = (Math.random() - 0.5) * 0.6;
  return Math.round((base + jitter) * 10) / 10;
}

export function createInitialReadings(): EquipmentReading[] {
  const now = new Date().toISOString();
  return EQUIPMENT_TEMPLATES.map((template) => {
    const offline = OFFLINE_IDS.has(template.id);
    const temperature = offline ? 0 : initialTemperature(template);
    return {
      ...template,
      temperature,
      previousTemperature: temperature,
      status: computeStatus(temperature, template.minTemp, template.maxTemp, offline),
      updatedAt: now,
    };
  });
}

export function simulateReadings(prev: EquipmentReading[]): EquipmentReading[] {
  const now = new Date().toISOString();
  return prev.map((reading) => {
    if (OFFLINE_IDS.has(reading.id)) {
      return {
        ...reading,
        status: "offline",
        updatedAt: now,
      };
    }

    const span = reading.maxTemp - reading.minTemp;
    const drift = (Math.random() - 0.5) * 0.35;
    let next = reading.temperature + drift;

    if (DEMO_OFFSETS[reading.id] && Math.random() < 0.15) {
      next += (Math.random() - 0.5) * 0.8;
    }

    const center = midpoint(reading.minTemp, reading.maxTemp);
    next += (center - next) * 0.05;
    next = Math.max(reading.minTemp - 6, Math.min(reading.maxTemp + 6, next));
    next = Math.round(next * 10) / 10;

    return {
      ...reading,
      previousTemperature: reading.temperature,
      temperature: next,
      status: computeStatus(next, reading.minTemp, reading.maxTemp),
      updatedAt: now,
    };
  });
}

export function statusLabel(status: TemperatureStatus): string {
  switch (status) {
    case "normal":
      return "Норма";
    case "warning":
      return "Внимание";
    case "critical":
      return "Критично";
    case "offline":
      return "Нет связи";
  }
}

export function kindLabel(kind: EquipmentKind): string {
  return EQUIPMENT_KIND_LABELS[kind];
}

export function defaultRangeForKind(kind: EquipmentKind): { min: number; max: number } {
  return KIND_RANGES[kind];
}
