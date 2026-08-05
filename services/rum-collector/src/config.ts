/** Версия контракта payload. Копии скрипта в двух репозиториях не должны разъехаться молча. */
export const RUM_PAYLOAD_VERSION = 1;

/** Метрики, которые принимаем. Всё остальное отбрасываем — защита от мусора. */
export const ALLOWED_METRICS = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;
export type RumMetric = (typeof ALLOWED_METRICS)[number];

export const ALLOWED_PLATFORMS = ["web", "android", "ios"] as const;
export const ALLOWED_SOURCES = ["site", "app"] as const;

/**
 * Разумные границы значений. Всё за пределами — либо сломанный клиент,
 * либо намеренный мусор. Пропускать нельзя: один выброс в 10^9 испортит
 * перцентили за час.
 *
 * CLS безразмерный (обычно 0..1), остальные в миллисекундах.
 */
export const METRIC_BOUNDS: Record<RumMetric, { min: number; max: number }> = {
  LCP: { min: 0, max: 120_000 },
  INP: { min: 0, max: 120_000 },
  CLS: { min: 0, max: 100 },
  TTFB: { min: 0, max: 120_000 },
  FCP: { min: 0, max: 120_000 },
};

/** Нормы p75 — те же, что использует Google для Core Web Vitals. */
export const METRIC_TARGETS: Record<RumMetric, { good: number; poor: number; unit: "ms" | "score" }> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "score" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
};

/** Сколько суток храним сырые события. Свёртки живут вечно. */
export function getRawRetentionDays(): number {
  const value = Number(process.env.RUM_RAW_RETENTION_DAYS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 14;
}

/**
 * Origin, с которых принимаем данные.
 *
 * Их четыре и все обязательны: сайт, WebView Capacitor на iOS
 * (`capacitor://localhost`), на Android (`http://localhost`) и веб-версия
 * приложения. Пропущенный origin — данные с этой платформы молча теряются,
 * ошибка видна только в консоли устройства.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.RUM_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return [
    "https://fuji.ru",
    "https://www.fuji.ru",
    "https://app.fuji.ru",
    "capacitor://localhost",
    "http://localhost",
    "ionic://localhost",
  ];
}

export function getServiceSecret(): string | null {
  return process.env.PERFORMANCE_IMPORT_SECRET?.trim() || null;
}

export function getPort(): number {
  return Number(process.env.PORT) || 3105;
}
