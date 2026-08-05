/**
 * Чистая доменная логика недельных норм обращений.
 *
 * Сознательно без импортов (ни БД, ни путевых алиасов): это позволяет
 * покрыть расчёт тестами и запускать их без сборки и без окружения.
 */

/** Целевая норма: 0.02 % обращений от количества заказов. */
export const APPEAL_NORM_RATIO = 0.0002;

/** Категория обращения, которая учитывается в норме. */
export const NORM_CATEGORY = "mobile_app";

/**
 * Норма обращений за неделю.
 *
 * Округление вниз намеренное: норма — потолок «сколько допустимо».
 * Округление вверх давало бы лишний бесплатный запас на малых объёмах
 * (при 4000 заказов норма 0.8 стала бы 1, то есть фактически 0.025 %).
 */
export function calcNormAppeals(ordersTotal: number): number {
  if (!Number.isFinite(ordersTotal) || ordersTotal <= 0) return 0;
  return Math.floor(ordersTotal * APPEAL_NORM_RATIO);
}

export function calcDeviation(appealsMobileApp: number, normAppeals: number): number {
  return appealsMobileApp - normAppeals;
}

export function isWithinNorm(appealsMobileApp: number, normAppeals: number): boolean {
  return appealsMobileApp <= normAppeals;
}

/** Фактическая доля обращений от заказов, в процентах. */
export function calcActualRatioPercent(
  appealsMobileApp: number,
  ordersTotal: number,
): number | null {
  if (!Number.isFinite(ordersTotal) || ordersTotal <= 0) return null;
  return (appealsMobileApp / ordersTotal) * 100;
}

/** Понедельник ISO-недели, в которую попадает дата. */
export function startOfIsoWeek(date: Date): Date {
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay(): 0 = воскресенье. Приводим к ISO, где понедельник = 0.
  const isoDayIndex = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - isoDayIndex);
  return result;
}

export function endOfIsoWeek(weekStart: Date): Date {
  const result = new Date(weekStart);
  result.setUTCDate(result.getUTCDate() + 6);
  return result;
}

/** Метка вида "2026-W32" по ISO-8601. */
export function formatIsoWeekLabel(weekStart: Date): string {
  const thursday = new Date(weekStart);
  // Год ISO-недели определяется по четвергу этой недели.
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();

  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekStart = startOfIsoWeek(firstThursday);
  const weekNumber =
    Math.round((weekStart.getTime() - firstWeekStart.getTime()) / (7 * 86_400_000)) + 1;

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
