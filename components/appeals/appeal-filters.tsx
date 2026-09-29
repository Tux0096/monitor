"use client";

import { getCategoryLabel, SUPPORT_CATEGORY_CATALOG, type SupportCategory } from "@/lib/support-classifier";
import { forwardRef } from "react";

export function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-xl border border-sky-400/50 bg-sky-500/10 p-4 text-left transition hover:border-sky-400/70"
          : "rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:border-zinc-600"
      }
    >
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </button>
  );
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
}) {
  const hasRange = Boolean(dateFrom || dateTo);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        От
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        До
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => onDateToChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      {hasRange ? (
        <button type="button" onClick={onClear} className="text-xs text-sky-400 hover:text-sky-300">
          Сбросить
        </button>
      ) : null}
    </div>
  );
}

export const CategoryFilterDropdown = forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    onToggle: () => void;
    selected: SupportCategory[];
    counts: Map<string, number>;
    onToggleCategory: (key: SupportCategory) => void;
    onClear: () => void;
  }
>(function CategoryFilterDropdown(
  { open, onToggle, selected, counts, onToggleCategory, onClear },
  ref,
) {
  const label =
    selected.length === 0
      ? "Тип проблемы: все"
      : selected.length === 1
        ? getCategoryLabel(selected[0])
        : `Тип проблемы: ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600 lg:min-w-[220px]"
      >
        <span className="truncate">{label}</span>
        <span className="text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 max-h-80 w-full min-w-[280px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl lg:w-[320px]">
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Тип проблемы</span>
            {selected.length > 0 ? (
              <button type="button" onClick={onClear} className="text-xs text-sky-400 hover:text-sky-300">
                Сбросить
              </button>
            ) : null}
          </div>
          {SUPPORT_CATEGORY_CATALOG.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-zinc-900"
            >
              <input
                type="checkbox"
                checked={selected.includes(item.key)}
                onChange={() => onToggleCategory(item.key)}
                className="rounded border-zinc-600 bg-zinc-900 text-sky-500"
              />
              <span className="flex-1 text-sm text-zinc-200">{item.label}</span>
              <span className="text-xs text-zinc-500">{counts.get(item.key) ?? 0}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
});
