"use client";

import type { AppealsStatistics, AppealsStatisticsAppealRow } from "@/lib/appeals";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WeeksPanel } from "./weeks-panel";
import {
  APPEAL_STATUS_LABELS,
  AXIS_TICK,
  AXIS_TICK_CATEGORY,
  BAR_RADIUS_HORIZONTAL,
  BAR_RADIUS_VERTICAL,
  CHART_SEGMENT_GAP,
  ChartCard,
  ChartTooltip,
  foldCategorical,
  formatMinutes,
  formatPercent,
  GRID_PROPS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "./chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultFromDate() {
  const now = new Date();
  return toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function defaultToDate() {
  return toLocalDateInputValue(new Date());
}

function formatAppealDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Стек «открытые / в работе / закрытые» — одинаковый во всех столбчатых графиках. */
function StatusBars({ stackId, radius }: { stackId: string; radius?: [number, number, number, number] }) {
  return (
    <>
      <Bar
        dataKey="open"
        name={STATUS_LABELS.open}
        stackId={stackId}
        fill={STATUS_COLORS.open}
        {...CHART_SEGMENT_GAP}
      />
      <Bar
        dataKey="inProgress"
        name={STATUS_LABELS.inProgress}
        stackId={stackId}
        fill={STATUS_COLORS.inProgress}
        {...CHART_SEGMENT_GAP}
      />
      <Bar
        dataKey="closed"
        name={STATUS_LABELS.closed}
        stackId={stackId}
        fill={STATUS_COLORS.closed}
        radius={radius}
        {...CHART_SEGMENT_GAP}
      />
    </>
  );
}

function CategoryAppealsDrilldown({
  categories,
  appeals,
}: {
  categories: Array<{ key: string; label: string }>;
  appeals: AppealsStatisticsAppealRow[];
}) {
  const selectable = useMemo(
    () => categories.filter((category) => category.key !== "__rest__"),
    [categories],
  );
  const [selectedKey, setSelectedKey] = useState<string>(selectable[0]?.key ?? "");

  // Выбранная категория может исчезнуть при смене периода — тогда берём первую.
  const activeKey = selectable.some((category) => category.key === selectedKey)
    ? selectedKey
    : (selectable[0]?.key ?? "");

  const filtered = useMemo(
    () => appeals.filter((appeal) => appeal.categoryKey === activeKey),
    [appeals, activeKey],
  );

  if (selectable.length === 0) return null;

  return (
    <div className="mt-4">
      <label className="text-xs text-zinc-500">
        Кто обращался
        <select
          value={activeKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          {selectable.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-800">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-zinc-500">Нет обращений в этой категории.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {filtered.map((appeal) => (
              <li key={appeal.id}>
                <Link
                  href={`/dashboard/appeals?appeal=${appeal.appealNumber}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-zinc-900"
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-200">
                    №{appeal.appealNumber} · {appeal.initiator}
                    {appeal.pointName ? ` · ${appeal.pointName}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatAppealDate(appeal.createdAt)}
                  </span>
                  <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                    {APPEAL_STATUS_LABELS[appeal.status] ?? appeal.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Итоговые цифры периода.
 *
 * Время показываем медианой, а не средним: одно забытое на неделю обращение
 * задирает среднее так, что метрика перестаёт описывать типичный случай.
 */
function SummaryCards({ summary }: { summary: AppealsStatistics["summary"] }) {
  const cards = [
    { label: "Всего обращений", value: String(summary.total), tone: "text-white" },
    { label: "Открытые", value: String(summary.open), tone: "text-zinc-300" },
    { label: "В работе", value: String(summary.inProgress), tone: "text-amber-300" },
    { label: "Закрытые", value: String(summary.closed), tone: "text-emerald-300" },
    { label: "Доля закрытых", value: formatPercent(summary.closedShare), tone: "text-emerald-300" },
    {
      label: "Реакция, медиана",
      value: formatMinutes(summary.medianResponseMinutes),
      tone: "text-sky-300",
      hint: `Среднее: ${formatMinutes(summary.avgResponseMinutes)}`,
    },
    {
      label: "Решение, медиана",
      value: formatMinutes(summary.medianResolveMinutes),
      tone: "text-violet-300",
      hint: `Среднее: ${formatMinutes(summary.avgResolveMinutes)}`,
    },
    {
      label: "Полный цикл, медиана",
      value: formatMinutes(summary.medianTotalMinutes),
      tone: "text-cyan-300",
      hint: `Среднее: ${formatMinutes(summary.avgTotalMinutes)}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
          {card.hint ? <div className="mt-1 text-[11px] text-zinc-600">{card.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function StatisticsPanel({ stats }: { stats: AppealsStatistics }) {
  const timelineData = useMemo(
    () => stats.timeline.map((row) => ({ ...row, name: row.label })),
    [stats.timeline],
  );

  const pointData = useMemo(
    () => stats.byPoint.map((row) => ({ ...row, name: row.label })),
    [stats.byPoint],
  );

  const initiatorData = useMemo(
    () => stats.byInitiator.map((row) => ({ ...row, name: row.label })),
    [stats.byInitiator],
  );

  const categorySlices = useMemo(() => foldCategorical(stats.byCategory), [stats.byCategory]);

  const categoryData = useMemo(
    () => categorySlices.map((slice) => ({ ...slice, name: slice.label, total: slice.value })),
    [categorySlices],
  );

  const resolutionData = useMemo(
    () => stats.byResolution.map((row) => ({ ...row, name: row.label })),
    [stats.byResolution],
  );

  const timelineHasData = timelineData.some((row) => row.total > 0);

  return (
    <div className="space-y-6">
      <SummaryCards summary={stats.summary} />

      <ChartCard
        title="Обращения по дням"
        hint="Новые обращения по датам, в разрезе текущего статуса"
        isEmpty={!timelineHasData}
        height="h-80"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={timelineData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="name" tick={AXIS_TICK} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#18181b" }} />
            <Legend />
            <StatusBars stackId="day" radius={BAR_RADIUS_VERTICAL} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="По типу обращения"
          hint="Без админов и офисных точек. Длинный хвост свёрнут в «Прочее»"
          isEmpty={categoryData.length === 0}
          height="h-80"
          footer={<CategoryAppealsDrilldown categories={categorySlices} appeals={stats.appeals} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} layout="vertical" margin={{ left: 12, right: 24 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
              <YAxis type="category" dataKey="name" width={150} tick={AXIS_TICK_CATEGORY} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#18181b" }} />
              <Bar dataKey="total" name="Обращений" radius={BAR_RADIUS_HORIZONTAL}>
                {categoryData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Как решали"
          hint="Закрытые обращения по способу решения"
          isEmpty={resolutionData.length === 0}
          emptyText="За период нет закрытых обращений."
          height="h-80"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resolutionData} layout="vertical" margin={{ left: 12, right: 24 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
              <YAxis type="category" dataKey="name" width={120} tick={AXIS_TICK_CATEGORY} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#18181b" }} />
              <Bar
                dataKey="total"
                name="Закрыто"
                fill={STATUS_COLORS.closed}
                radius={BAR_RADIUS_HORIZONTAL}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="По точкам" hint="Топ точек за период" isEmpty={pointData.length === 0} height="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pointData} layout="vertical" margin={{ left: 12, right: 12 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
              <YAxis type="category" dataKey="name" width={140} tick={AXIS_TICK_CATEGORY} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#18181b" }} />
              <Legend />
              <StatusBars stackId="point" radius={BAR_RADIUS_HORIZONTAL} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="По заявителям"
          hint="Топ курьеров за период"
          isEmpty={initiatorData.length === 0}
          height="h-80"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={initiatorData} layout="vertical" margin={{ left: 12, right: 12 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
              <YAxis type="category" dataKey="name" width={140} tick={AXIS_TICK_CATEGORY} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#18181b" }} />
              <Legend />
              <StatusBars stackId="initiator" radius={BAR_RADIUS_HORIZONTAL} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

type StatisticsView = "appeals" | "weeks";

export function StatisticsClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [view, setView] = useState<StatisticsView>("appeals");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [stats, setStats] = useState<AppealsStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        _: String(Date.now()),
      });
      const response = await fetch(`/api/appeals/statistics?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setError("Не удалось загрузить статистику");
        return;
      }
      const data = (await response.json()) as AppealsStatistics;
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    function onFocus() {
      void loadStats();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") onFocus();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadStats]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Мониторинг обращений</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Статистика</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Обращения курьеров из MAX: сколько приходит, как быстро берут в работу и чем
            заканчивается.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
        >
          Обновить
        </button>
      </div>

      <div className="mb-4 flex w-fit rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        <button
          type="button"
          onClick={() => setView("appeals")}
          className={
            view === "appeals"
              ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
              : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          }
        >
          Обращения
        </button>
        <button
          type="button"
          onClick={() => setView("weeks")}
          className={
            view === "weeks"
              ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
              : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          }
        >
          Недельные нормы
        </button>
      </div>

      {view === "weeks" ? <WeeksPanel isAdmin={isAdmin} /> : null}

      {view === "appeals" ? (
        <>
          <section className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <label className="text-sm text-zinc-400">
              С
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 block rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="text-sm text-zinc-400">
              По
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 block rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            {stats ? (
              <div className="ml-auto text-sm text-zinc-500">
                Период: {stats.from} — {stats.to}
              </div>
            ) : null}
          </section>

          {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}

          {loading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
              Загружаем статистику…
            </div>
          ) : stats && stats.summary.total === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
              За выбранный период обращений нет.
            </div>
          ) : stats ? (
            <StatisticsPanel stats={stats} />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
