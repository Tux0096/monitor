"use client";

import type { AppealsStatistics, AppealsStatisticsAppealRow, AppealsStatisticsChannel } from "@/lib/appeals";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WeeksPanel } from "./weeks-panel";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS = {
  open: "#a1a1aa",
  inProgress: "#fbbf24",
  closed: "#34d399",
};

const CATEGORY_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#34d399",
  "#fb7185",
  "#22d3ee",
  "#f97316",
  "#818cf8",
  "#4ade80",
  "#e879f9",
];

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

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)} мин`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs shadow-xl">
      {label ? <div className="mb-1 font-medium text-zinc-200">{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-white">{entry.value ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

const APPEAL_STATUS_LABELS: Record<string, string> = {
  open: "Открыто",
  in_progress: "В работе",
  closed: "Закрыто",
};

function formatAppealDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CategoryAppealsDrilldown({
  categories,
  appeals,
}: {
  categories: Array<{ key: string; name: string; value: number }>;
  appeals: AppealsStatisticsAppealRow[];
}) {
  const [selectedKey, setSelectedKey] = useState<string>(categories[0]?.key ?? "");

  useEffect(() => {
    if (!categories.some((category) => category.key === selectedKey)) {
      setSelectedKey(categories[0]?.key ?? "");
    }
  }, [categories, selectedKey]);

  const filtered = useMemo(
    () => appeals.filter((appeal) => appeal.categoryKey === selectedKey),
    [appeals, selectedKey],
  );

  if (categories.length === 0) return null;

  return (
    <div className="mt-4">
      <label className="text-xs text-zinc-500">
        Кто обращался
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          {categories.map((category) => (
            <option key={category.key} value={category.key}>
              {category.name} ({category.value})
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
                  <span className="shrink-0 text-xs text-zinc-500">{formatAppealDate(appeal.createdAt)}</span>
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

function SummaryCards({ summary }: { summary: AppealsStatistics["summary"] }) {
  const cards = [
    { label: "Всего обращений", value: String(summary.total), tone: "text-white" },
    { label: "Открытые", value: String(summary.open), tone: "text-zinc-300" },
    { label: "В работе", value: String(summary.inProgress), tone: "text-amber-300" },
    { label: "Закрытые", value: String(summary.closed), tone: "text-emerald-300" },
    { label: "Среднее реагирование", value: formatMinutes(summary.avgResponseMinutes), tone: "text-sky-300" },
    { label: "Среднее выполнение", value: formatMinutes(summary.avgResolveMinutes), tone: "text-violet-300" },
    { label: "Среднее общее время", value: formatMinutes(summary.avgTotalMinutes), tone: "text-cyan-300" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</div>
          <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatisticsPanel({ stats }: { stats: AppealsStatistics }) {
  const statusData = useMemo(
    () => [
      { name: "Открытые", value: stats.summary.open, key: "open" },
      { name: "В работе", value: stats.summary.inProgress, key: "inProgress" },
      { name: "Закрытые", value: stats.summary.closed, key: "closed" },
    ],
    [stats.summary],
  );

  const timelineData = useMemo(
    () =>
      stats.timeline.map((row) => ({
        ...row,
        name: row.label,
      })),
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

  const dailyCountData = useMemo(
    () =>
      stats.timeline.map((row) => ({
        name: row.label,
        total: row.total,
      })),
    [stats.timeline],
  );

  const categoryData = useMemo(
    () =>
      stats.byCategory.map((row) => ({
        name: row.label,
        value: row.total,
        key: row.key,
      })),
    [stats.byCategory],
  );

  return (
    <div className="space-y-6">
      <SummaryCards summary={stats.summary} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">Обращений в день</h2>
          <p className="mt-1 text-xs text-zinc-500">Количество новых обращений по датам</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyCountData}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Обращений" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">По типу обращения</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Данные из БД support_appeals: без админов и без офисных точек (Колл центр)
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart key={categoryData.map((row) => `${row.name}:${row.value}`).join("|")}>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={entry.key}
                      fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <CategoryAppealsDrilldown categories={categoryData} appeals={stats.appeals} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">Статусы обращений</h2>
          <p className="mt-1 text-xs text-zinc-500">Клик по легенде скрывает сегмент</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {statusData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">Динамика по дням</h2>
          <p className="mt-1 text-xs text-zinc-500">Наведите на точку для детализации</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="open"
                  name="Открытые"
                  stackId="1"
                  stroke={STATUS_COLORS.open}
                  fill={STATUS_COLORS.open}
                  fillOpacity={0.35}
                />
                <Area
                  type="monotone"
                  dataKey="inProgress"
                  name="В работе"
                  stackId="1"
                  stroke={STATUS_COLORS.inProgress}
                  fill={STATUS_COLORS.inProgress}
                  fillOpacity={0.35}
                />
                <Area
                  type="monotone"
                  dataKey="closed"
                  name="Закрытые"
                  stackId="1"
                  stroke={STATUS_COLORS.closed}
                  fill={STATUS_COLORS.closed}
                  fillOpacity={0.35}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">По точкам</h2>
          <p className="mt-1 text-xs text-zinc-500">Топ точек за период</p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pointData} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: "#d4d4d8", fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="open" name="Открытые" stackId="a" fill={STATUS_COLORS.open} />
                <Bar dataKey="inProgress" name="В работе" stackId="a" fill={STATUS_COLORS.inProgress} />
                <Bar dataKey="closed" name="Закрытые" stackId="a" fill={STATUS_COLORS.closed} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">По заявителям</h2>
          <p className="mt-1 text-xs text-zinc-500">Топ инициаторов за период</p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={initiatorData} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: "#d4d4d8", fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="open" name="Открытые" stackId="b" fill={STATUS_COLORS.open} />
                <Bar dataKey="inProgress" name="В работе" stackId="b" fill={STATUS_COLORS.inProgress} />
                <Bar dataKey="closed" name="Закрытые" stackId="b" fill={STATUS_COLORS.closed} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

type StatisticsView = "appeals" | "weeks";

export function StatisticsClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [view, setView] = useState<StatisticsView>("appeals");
  const [channel, setChannel] = useState<AppealsStatisticsChannel>("courier");
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
        channel,
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
  }, [channel, fromDate, toDate]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    function onFocus() {
      void loadStats();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [loadStats]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Мониторинг обращений</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Статистика</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Сводка по обращениям в поддержку и курьерскому приложению с интерактивными графиками.
            Обращения из MAX — вкладка «Курьерское приложение».
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
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          <button
            type="button"
            onClick={() => setChannel("it")}
            className={
              channel === "it"
                ? "rounded-lg bg-sky-500/20 px-4 py-2 text-sm text-sky-100"
                : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            }
          >
            Поддержка IT
          </button>
          <button
            type="button"
            onClick={() => setChannel("courier")}
            className={
              channel === "courier"
                ? "rounded-lg bg-violet-500/20 px-4 py-2 text-sm text-violet-100"
                : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            }
          >
            Курьерское приложение
          </button>
        </div>
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
