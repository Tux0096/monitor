/**
 * Чистые расчёты для статистики обращений: без React и без БД, чтобы их можно
 * было использовать и на сервере (агрегация), и в клиентских графиках, и
 * покрыть тестами.
 */

/**
 * Медиана в минутах по набору длительностей в секундах.
 *
 * Медиана, а не среднее: одно забытое на неделю обращение задирает среднее так,
 * что метрика перестаёт описывать типичный случай.
 */
export function medianMinutes(secondsValues: number[]): number | null {
  if (secondsValues.length === 0) return null;
  const sorted = [...secondsValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const seconds =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return seconds / 60;
}

export function averageMinutes(secondsValues: number[]): number | null {
  if (secondsValues.length === 0) return null;
  const sum = secondsValues.reduce((total, value) => total + value, 0);
  return sum / secondsValues.length / 60;
}

export type CategoricalRow = { key: string; label: string; total: number };

export type FoldedCategoricalRow = CategoricalRow & { rest: boolean };

/**
 * Сворачивает длинный хвост категорий в одну строку «Прочее».
 *
 * Цветов в палитре конечное число, и переиспользовать их по кругу нельзя: две
 * разные категории одного цвета читаются как одна. Поэтому всё, что не влезло
 * в `maxSlots`, суммируется в хвост.
 */
export function foldCategoricalRows(
  rows: CategoricalRow[],
  maxSlots: number,
): FoldedCategoricalRow[] {
  if (maxSlots < 1) return [];
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  if (sorted.length <= maxSlots) {
    return sorted.map((row) => ({ ...row, rest: false }));
  }

  const head = sorted.slice(0, maxSlots - 1).map((row) => ({ ...row, rest: false }));
  const tail = sorted.slice(maxSlots - 1);
  const restTotal = tail.reduce((sum, row) => sum + row.total, 0);

  return [
    ...head,
    { key: "__rest__", label: `Прочее (${tail.length})`, total: restTotal, rest: true },
  ];
}
