"use client";

import { foldCategoricalRows } from "@/lib/appeal-statistics";
import type { ReactNode } from "react";

/**
 * Единые токены графиков дашборда.
 *
 * До рефакторинга цвета и настройки осей были разбросаны по компонентам двумя
 * захардкоженными массивами. Теперь любой график берёт их отсюда, поэтому
 * палитра остаётся одинаковой на всех экранах.
 *
 * Палитра проверена валидатором на поверхности графика (#09090b, zinc-950):
 * все пары различимы при дальтонизме и дают контраст ≥ 3:1 к фону.
 */

/** Поверхность, на которой лежат графики (zinc-950). */
export const CHART_SURFACE = "#09090b";

/** Цвет разделителя между сегментами стека — 2px зазор цветом поверхности. */
export const CHART_SEGMENT_GAP = { stroke: CHART_SURFACE, strokeWidth: 2 } as const;

/**
 * Статусы — зарезервированная палитра состояния, не используется как «серия N».
 * Серый для «открыто» читается как нейтральное ожидание.
 */
export const STATUS_COLORS = {
  open: "#71717a",
  inProgress: "#f59e0b",
  closed: "#10b981",
} as const;

export const STATUS_LABELS = {
  open: "Открытые",
  inProgress: "В работе",
  closed: "Закрытые",
} as const;

export const APPEAL_STATUS_LABELS: Record<string, string> = {
  open: "Открыто",
  in_progress: "В работе",
  closed: "Закрыто",
};

/**
 * Категориальная палитра: фиксированный порядок, слоты назначаются по сущности
 * и никогда не перекрашиваются при смене фильтра. Девятая категория не
 * получает новый цвет — она сворачивается в «Прочее» (см. foldCategorical).
 */
export const CATEGORICAL_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

/** Цвет свёрнутого хвоста «Прочее» — нейтральный, вне категориальной палитры. */
export const CATEGORICAL_REST_COLOR = "#52525b";

export const AXIS_TICK = { fill: "#a1a1aa", fontSize: 11 } as const;
export const AXIS_TICK_CATEGORY = { fill: "#d4d4d8", fontSize: 11 } as const;
export const GRID_PROPS = { stroke: "#27272a", strokeDasharray: "3 3" } as const;

/** Скруглённый конец столбца, привязанный к базовой линии. */
export const BAR_RADIUS_VERTICAL: [number, number, number, number] = [4, 4, 0, 0];
export const BAR_RADIUS_HORIZONTAL: [number, number, number, number] = [0, 4, 4, 0];

export type CategoricalSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/**
 * Раскладывает категории по слотам палитры: свёртка хвоста в «Прочее» живёт в
 * `lib/appeal-statistics`, здесь к строкам добавляются только цвета.
 */
export function foldCategorical(
  rows: Array<{ key: string; label: string; total: number }>,
  maxSlots = CATEGORICAL_COLORS.length,
): CategoricalSlice[] {
  return foldCategoricalRows(rows, maxSlots).map((row, index) => ({
    key: row.key,
    label: row.label,
    value: row.total,
    color: row.rest ? CATEGORICAL_REST_COLOR : CATEGORICAL_COLORS[index],
  }));
}

/** Минуты в человеческий вид: «12 мин», «3 ч 20 мин». */
export function formatMinutes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)} мин`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((entry) => entry.value != null && entry.value !== 0);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs shadow-xl">
      {label ? <div className="mb-1 font-medium text-zinc-200">{label}</div> : null}
      {visible.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-white">{entry.value ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

/** Карточка графика: заголовок, подпись, пустое состояние и сам график. */
export function ChartCard({
  title,
  hint,
  isEmpty,
  emptyText = "Нет данных за выбранный период.",
  height = "h-72",
  children,
  footer,
}: {
  title: string;
  hint?: string;
  isEmpty?: boolean;
  emptyText?: string;
  height?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="text-sm font-medium text-white">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      {isEmpty ? (
        <div className={`mt-4 flex ${height} items-center justify-center rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-600`}>
          {emptyText}
        </div>
      ) : (
        <div className={`mt-4 ${height}`}>{children}</div>
      )}
      {footer}
    </section>
  );
}
