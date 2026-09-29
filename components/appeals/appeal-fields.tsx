"use client";

import type { Appeal } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export function formatPointLabel(point: DeliveryPoint): string {
  return point.city ? `${point.name} · ${point.city}` : point.name;
}

function useFilteredPoints(points: DeliveryPoint[], query: string) {
  return useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return points;
    return points.filter((point) => formatPointLabel(point).toLowerCase().includes(normalized));
  }, [points, query]);
}

export function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
      />
    </label>
  );
}

export function PointSelect({
  label,
  points,
  value,
  onChange,
}: {
  label: string;
  points: DeliveryPoint[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredPoints = useFilteredPoints(points, query);

  return (
    <label className="block text-xs text-zinc-500">
      {label}
      {points.length > 8 ? (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск точки…"
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
      >
        <option value="">Не указана — выберите вручную</option>
        {filteredPoints.map((point) => (
          <option key={point.id} value={point.id}>
            {formatPointLabel(point)}
          </option>
        ))}
      </select>
      {points.length === 0 ? (
        <span className="mt-1 block text-[11px] text-zinc-600">
          <Link href="/dashboard/points" className="text-sky-400 hover:text-sky-300">
            Создайте точки
          </Link>{" "}
          во вкладке слева
        </span>
      ) : null}
    </label>
  );
}

export function InlinePointPicker({
  appeal,
  points,
  disabled,
  onSave,
}: {
  appeal: Appeal;
  points: DeliveryPoint[];
  disabled?: boolean;
  onSave: (pointId: string | null) => Promise<boolean> | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filteredPoints = useFilteredPoints(points, query);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function choose(pointId: string | null) {
    setSaving(true);
    try {
      const ok = await onSave(pointId);
      if (ok) setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={disabled || saving || points.length === 0}
        onClick={() => setOpen((current) => !current)}
        className={
          appeal.pointName
            ? "rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200 hover:border-sky-400/60 disabled:opacity-50"
            : "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200 hover:border-amber-400/60 disabled:opacity-50"
        }
        title="Указать или изменить точку вручную"
      >
        {saving ? "…" : (appeal.pointName ?? "Указать точку")}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск точки…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600"
          />
          <div className="mt-2 max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => void choose(null)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-900"
            >
              Без точки
            </button>
            {filteredPoints.map((point) => (
              <button
                key={point.id}
                type="button"
                onClick={() => void choose(point.id)}
                className={
                  appeal.pointId === point.id
                    ? "block w-full rounded-md bg-sky-500/15 px-2 py-1.5 text-left text-xs text-sky-100"
                    : "block w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-900"
                }
              >
                {formatPointLabel(point)}
              </button>
            ))}
            {filteredPoints.length === 0 ? (
              <div className="px-2 py-2 text-xs text-zinc-500">Ничего не найдено</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
