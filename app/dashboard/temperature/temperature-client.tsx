"use client";

import {
  createInitialReadings,
  formatRange,
  formatTemp,
  kindLabel,
  simulateReadings,
  statusLabel,
  type EquipmentKind,
  type EquipmentReading,
  type SiteId,
  type TemperatureStatus,
  SITES,
} from "@/lib/temperature";
import { useEffect, useMemo, useState } from "react";

const POLL_MS = 5000;

type StatusFilter = "all" | TemperatureStatus;
type SiteFilter = "all" | SiteId;

export function TemperatureClient() {
  const [readings, setReadings] = useState<EquipmentReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<EquipmentKind | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadInitial();
    const interval = window.setInterval(() => {
      setReadings((current) => {
        if (current.length === 0) return current;
        const next = simulateReadings(current);
        setLastRefresh(new Date());
        return next;
      });
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  async function loadInitial() {
    setLoading(true);
    try {
      const response = await fetch("/api/temperature", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { readings: EquipmentReading[] };
        setReadings(data.readings);
      } else {
        const fallback = createInitialReadings();
        setReadings(fallback);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = readings.length;
    const normal = readings.filter((r) => r.status === "normal").length;
    const warning = readings.filter((r) => r.status === "warning").length;
    const critical = readings.filter((r) => r.status === "critical").length;
    const offline = readings.filter((r) => r.status === "offline").length;
    return { total, normal, warning, critical, offline };
  }, [readings]);

  const kindOptions = useMemo(() => {
    const kinds = new Set(readings.map((r) => r.kind));
    return Array.from(kinds);
  }, [readings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return readings.filter((reading) => {
      if (siteFilter !== "all" && reading.siteId !== siteFilter) return false;
      if (statusFilter !== "all" && reading.status !== statusFilter) return false;
      if (kindFilter !== "all" && reading.kind !== kindFilter) return false;
      if (!query) return true;
      const haystack = [
        reading.name,
        reading.zone,
        kindLabel(reading.kind),
        SITES.find((s) => s.id === reading.siteId)?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [readings, siteFilter, statusFilter, kindFilter, search]);

  const grouped = useMemo(() => {
    if (siteFilter !== "all") {
      return [{ siteId: siteFilter, items: filtered }];
    }
    return SITES.map((site) => ({
      siteId: site.id,
      items: filtered.filter((r) => r.siteId === site.id),
    })).filter((group) => group.items.length > 0);
  }, [filtered, siteFilter]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Холодильное оборудование · live</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Мониторинг температуры</h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Обновление каждые {POLL_MS / 1000} с
            {lastRefresh && (
              <span className="text-zinc-600">
                · последнее {lastRefresh.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadInitial()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Сбросить демо
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Всего датчиков" value={stats.total} />
        <SummaryCard label="В норме" value={stats.normal} tone="normal" />
        <SummaryCard label="Внимание" value={stats.warning} tone="warning" />
        <SummaryCard label="Критично" value={stats.critical} tone="critical" />
        <SummaryCard label="Нет связи" value={stats.offline} tone="offline" />
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={siteFilter === "all"} onClick={() => setSiteFilter("all")}>
            Все точки
          </FilterChip>
          {SITES.map((site) => (
            <FilterChip
              key={site.id}
              active={siteFilter === site.id}
              onClick={() => setSiteFilter(site.id)}
            >
              {site.name}
            </FilterChip>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, зоне, типу…"
            className="min-w-[200px] flex-1 rounded-lg border border-zinc-800 bg-zinc-900/950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as EquipmentKind | "all")}
            className="rounded-lg border border-zinc-800 bg-zinc-900/950 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="all">Все типы</option>
            {kindOptions.map((kind) => (
              <option key={kind} value={kind}>{kindLabel(kind)}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-lg border border-zinc-800 bg-zinc-900/950 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="all">Все статусы</option>
            <option value="normal">Норма</option>
            <option value="warning">Внимание</option>
            <option value="critical">Критично</option>
            <option value="offline">Нет связи</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", "critical", "warning", "normal", "offline"] as StatusFilter[]).map((status) => (
            <FilterChip
              key={status}
              active={statusFilter === status}
              onClick={() => setStatusFilter(status)}
              small
            >
              {status === "all" ? "Все" : statusLabel(status)}
              {status !== "all" && (
                <span className="ml-1 text-zinc-600">
                  ({readings.filter((r) => r.status === status).length})
                </span>
              )}
            </FilterChip>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Загружаем датчики…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">Нет оборудования по выбранным фильтрам.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map((group) => {
            const siteName = SITES.find((s) => s.id === group.siteId)?.name ?? group.siteId;
            const siteStats = {
              warning: group.items.filter((r) => r.status === "warning").length,
              critical: group.items.filter((r) => r.status === "critical").length,
              offline: group.items.filter((r) => r.status === "offline").length,
            };
            return (
              <section key={group.siteId}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-medium text-white">{siteName}</h2>
                    <p className="text-xs text-zinc-600">
                      {group.items.length} единиц оборудования
                      {siteStats.critical > 0 && (
                        <span className="ml-2 text-red-300">· {siteStats.critical} критично</span>
                      )}
                      {siteStats.warning > 0 && (
                        <span className="ml-2 text-amber-300">· {siteStats.warning} внимание</span>
                      )}
                      {siteStats.offline > 0 && (
                        <span className="ml-2 text-zinc-400">· {siteStats.offline} без связи</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((reading) => (
                    <EquipmentCard key={reading.id} reading={reading} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-600">
        Прототип: демо-данные с имитацией live-обновлений. Нормы: холодильники и саладеты +2…+6 °C,
        морозильные камеры −22…−18 °C, витрины 0…+4 °C.
      </p>
    </main>
  );
}

function EquipmentCard({ reading }: { reading: EquipmentReading }) {
  const delta = reading.temperature - reading.previousTemperature;
  const siteName = SITES.find((s) => s.id === reading.siteId)?.name ?? reading.siteId;

  return (
    <article
      className={`rounded-xl border bg-zinc-900/50 p-4 transition-colors ${statusBorderClass(reading.status)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{reading.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {kindLabel(reading.kind)} · {reading.zone}
          </p>
        </div>
        <StatusBadge status={reading.status} />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          {reading.status === "offline" ? (
            <p className="text-2xl font-semibold text-zinc-500">—</p>
          ) : (
            <p className={`text-3xl font-semibold tabular-nums ${statusTextClass(reading.status)}`}>
              {formatTemp(reading.temperature)}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-600">
            Норма {formatRange(reading.minTemp, reading.maxTemp)}
          </p>
        </div>
        {reading.status !== "offline" && (
          <TrendHint delta={delta} />
        )}
      </div>

      <div className="mt-3">
        <RangeBar
          value={reading.temperature}
          min={reading.minTemp}
          max={reading.maxTemp}
          status={reading.status}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
        <span className="truncate">{siteName}</span>
        <time dateTime={reading.updatedAt}>
          {new Date(reading.updatedAt).toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </time>
      </div>
    </article>
  );
}

function RangeBar({
  value,
  min,
  max,
  status,
}: {
  value: number;
  min: number;
  max: number;
  status: TemperatureStatus;
}) {
  const padding = (max - min) * 0.35;
  const scaleMin = min - padding;
  const scaleMax = max + padding;
  const span = scaleMax - scaleMin;
  const normMin = ((min - scaleMin) / span) * 100;
  const normMax = ((max - scaleMin) / span) * 100;
  const marker = Math.max(0, Math.min(100, ((value - scaleMin) / span) * 100));

  return (
    <div className="relative h-2 rounded-full bg-zinc-800">
      <div
        className="absolute top-0 h-full rounded-full bg-emerald-500/25"
        style={{ left: `${normMin}%`, width: `${normMax - normMin}%` }}
      />
      <div
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-zinc-950 ${statusMarkerClass(status)}`}
        style={{ left: `calc(${marker}% - 6px)` }}
      />
    </div>
  );
}

function TrendHint({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) {
    return <span className="text-xs text-zinc-600">стабильно</span>;
  }
  const up = delta > 0;
  return (
    <span className={`text-sm font-medium tabular-nums ${up ? "text-amber-300" : "text-sky-400"}`}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function StatusBadge({ status }: { status: TemperatureStatus }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | TemperatureStatus;
}) {
  const valueClass =
    tone === "normal"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "critical"
          ? "text-red-300"
          : tone === "offline"
            ? "text-zinc-400"
            : "text-white";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  small = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border text-sm transition-colors ${
        small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5"
      } ${
        active
          ? "border-sky-400/50 bg-sky-500/10 text-sky-300"
          : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function statusBorderClass(status: TemperatureStatus): string {
  switch (status) {
    case "normal":
      return "border-zinc-800";
    case "warning":
      return "border-amber-500/40";
    case "critical":
      return "border-red-500/50";
    case "offline":
      return "border-zinc-700 border-dashed";
  }
}

function statusTextClass(status: TemperatureStatus): string {
  switch (status) {
    case "normal":
      return "text-white";
    case "warning":
      return "text-amber-200";
    case "critical":
      return "text-red-300";
    case "offline":
      return "text-zinc-500";
  }
}

function statusBadgeClass(status: TemperatureStatus): string {
  switch (status) {
    case "normal":
      return "bg-emerald-500/15 text-emerald-300";
    case "warning":
      return "bg-amber-500/20 text-amber-200";
    case "critical":
      return "bg-red-500/20 text-red-300";
    case "offline":
      return "bg-zinc-800 text-zinc-400";
  }
}

function statusMarkerClass(status: TemperatureStatus): string {
  switch (status) {
    case "normal":
      return "bg-emerald-400";
    case "warning":
      return "bg-amber-400";
    case "critical":
      return "bg-red-400";
    case "offline":
      return "bg-zinc-500";
  }
}
