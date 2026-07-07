"use client";

import type {
  HistoryChartPoint,
  HistoryPageMetric,
  PerformanceHistoryReport,
  PerformanceSourceType,
} from "@/lib/firebase-performance-history";
import {
  getMetricSlowLabel,
  isMetricSlow,
} from "@/lib/monitoring-thresholds";
import type { MonitorSnapshot } from "@/lib/types";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ApiErrorPayload = {
  error?: string;
  hint?: string;
};

const pageSize = 4;

const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

export function DashboardClient({}: { initial: MonitorSnapshot }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [report, setReport] = useState<PerformanceHistoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [siteExpanded, setSiteExpanded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [mobileApiExpanded, setMobileApiExpanded] = useState(false);
  const [siteSelectedKey, setSiteSelectedKey] = useState<string | null>(null);
  const [mobileSelectedKey, setMobileSelectedKey] = useState<string | null>(null);
  const [mobileApiSelectedKey, setMobileApiSelectedKey] = useState<string | null>(null);
  const [monitorDateFrom, setMonitorDateFrom] = useState(() => defaultMonitorDateFrom());
  const [monitorDateTo, setMonitorDateTo] = useState(() => defaultMonitorDateTo());
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const prevSlowKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotifyEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (!report?.pages || !notifyEnabled || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") return;

    const slowNow = report.pages.filter((page) => isMetricSlow(page.currentMs, page.sourceType));
    const newlySlow = slowNow.filter((page) => !prevSlowKeysRef.current.has(pageKey(page)));
    if (newlySlow.length === 0) {
      prevSlowKeysRef.current = new Set(slowNow.map(pageKey));
      return;
    }

    if (newlySlow.length === 1) {
      const item = newlySlow[0]!;
      new Notification("Показатель выше нормы", {
        body: `${item.metricName}: ${formatTime(item.currentMs)} · норма ${getMetricSlowLabel(item.sourceType)}\n${item.page}`,
        tag: `slow-${pageKey(item)}`,
      });
    } else {
      new Notification("Показатели выше нормы", {
        body: `${newlySlow.length} показателей превысили норму\n${newlySlow
          .slice(0, 4)
          .map((item) => `${item.metricName}: ${formatTime(item.currentMs)}`)
          .join("\n")}${newlySlow.length > 4 ? "\n…" : ""}`,
        tag: "slow-metrics-batch",
      });
    }

    prevSlowKeysRef.current = new Set(slowNow.map(pageKey));
  }, [report, notifyEnabled]);

  async function enableBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    const granted = permission === "granted";
    setNotifyEnabled(granted);
    if (granted && report?.pages) {
      prevSlowKeysRef.current = new Set();
    }
  }

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (monitorDateFrom) params.set("from", monitorDateFrom);
        if (monitorDateTo) params.set("to", monitorDateTo);
        const query = params.toString();
        const response = await fetch(
          `/api/firebase/performance/history${query ? `?${query}` : ""}`,
          { cache: "no-store" },
        );
        const data = await readJson<PerformanceHistoryReport & ApiErrorPayload>(response);

        if (cancelled) return;

        if (!response.ok) {
          setReport(null);
          return;
        }

        setReport(data.pages ? data : null);
        setUpdatedAt(data.fetchedAt);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.user, monitorDateFrom, monitorDateTo]);

  async function logout() {
    await signOut({ callbackUrl: "/login" });
    router.refresh();
  }

  const sitePages = (report?.pages ?? []).filter((page) => page.sourceType === "site");
  const mobilePages = (report?.pages ?? []).filter((page) => page.sourceType === "mobile");
  const mobileApiPages = (report?.pages ?? []).filter((page) => page.sourceType === "mobile_api");
  const selectedSite =
    sitePages.find((page) => pageKey(page) === siteSelectedKey) ?? sitePages[0] ?? null;
  const selectedMobile =
    mobilePages.find((page) => pageKey(page) === mobileSelectedKey) ?? mobilePages[0] ?? null;
  const selectedMobileApi =
    mobileApiPages.find((page) => pageKey(page) === mobileApiSelectedKey) ??
    mobileApiPages[0] ??
    null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div className="min-w-0">
          <p className="text-xs text-zinc-600">Фуджи · Performance</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Аналитика</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <span className="text-sm text-zinc-500">{session?.user?.email}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Выйти
          </button>
        </div>
      </header>

      {!session?.user ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
          Загружаем дашборд…
        </div>
      ) : (
        <div className="space-y-2">
          <ExpandableCard
            title="Мониторинг сайта"
            summary={`${sitePages.length} показателей${updatedAt ? ` · обновлено ${new Date(updatedAt).toLocaleTimeString("ru-RU")}` : ""}`}
            badge={
              sitePages.length > 0 ? (
                <SlowMetricsBadge count={countSlowMetrics(sitePages)} thresholdLabel="1.3 с" />
              ) : null
            }
            expanded={siteExpanded}
            onToggle={() => setSiteExpanded((value) => !value)}
          >
            <MonitoringAlertsBar
              slowCount={countSlowMetrics(sitePages)}
              thresholdLabel="1.3 с"
              notifyEnabled={notifyEnabled}
              onEnableNotifications={() => void enableBrowserNotifications()}
            />
            <div className="mb-4">
              <DateRangeFilter
                dateFrom={monitorDateFrom}
                dateTo={monitorDateTo}
                onDateFromChange={setMonitorDateFrom}
                onDateToChange={setMonitorDateTo}
                onClear={() => {
                  setMonitorDateFrom(defaultMonitorDateFrom());
                  setMonitorDateTo(defaultMonitorDateTo());
                }}
              />
            </div>
            <MonitoringMetricsGrid
              items={sitePages}
              selectedKey={selectedSite ? pageKey(selectedSite) : null}
              onSelect={setSiteSelectedKey}
              loading={loading && !report}
            />
            {selectedSite ? (
              <MetricDetailPanel item={selectedSite} updatedAt={updatedAt} />
            ) : loading && !report ? (
              <ChartSkeleton compact />
            ) : sitePages.length === 0 ? (
              <EmptyHint text="Данные готовятся. Показатели появятся после первой загрузки." />
            ) : null}
          </ExpandableCard>

          <ExpandableCard
            title="Мониторинг мобильного приложения"
            summary={`${mobilePages.length} показателей${updatedAt ? ` · обновлено ${new Date(updatedAt).toLocaleTimeString("ru-RU")}` : ""}`}
            badge={
              mobilePages.length > 0 ? (
                <SlowMetricsBadge count={countSlowMetrics(mobilePages)} />
              ) : null
            }
            expanded={mobileExpanded}
            onToggle={() => setMobileExpanded((value) => !value)}
          >
            <MonitoringAlertsBar
              slowCount={countSlowMetrics(mobilePages)}
              notifyEnabled={notifyEnabled}
              onEnableNotifications={() => void enableBrowserNotifications()}
            />
            <div className="mb-4">
              <DateRangeFilter
                dateFrom={monitorDateFrom}
                dateTo={monitorDateTo}
                onDateFromChange={setMonitorDateFrom}
                onDateToChange={setMonitorDateTo}
                onClear={() => {
                  setMonitorDateFrom(defaultMonitorDateFrom());
                  setMonitorDateTo(defaultMonitorDateTo());
                }}
              />
            </div>
            <MonitoringMetricsGrid
              items={mobilePages}
              selectedKey={selectedMobile ? pageKey(selectedMobile) : null}
              onSelect={setMobileSelectedKey}
              loading={loading && !report}
            />
            {selectedMobile ? (
              <MetricDetailPanel item={selectedMobile} updatedAt={updatedAt} />
            ) : loading && !report ? (
              <ChartSkeleton compact />
            ) : mobilePages.length === 0 ? (
              <EmptyHint text="Нет данных Firebase Performance. Загрузите ключ сервисного аккаунта на сервер (см. FIREBASE_SETUP.md) и запустите импорт." />
            ) : null}
          </ExpandableCard>

          <ExpandableCard
            title="Доступность API приложения"
            summary={`${mobileApiPages.length} показателей · синтетические HTTP-пробы${updatedAt ? ` · обновлено ${new Date(updatedAt).toLocaleTimeString("ru-RU")}` : ""}`}
            badge={
              mobileApiPages.length > 0 ? (
                <SlowMetricsBadge count={countSlowMetrics(mobileApiPages)} />
              ) : null
            }
            expanded={mobileApiExpanded}
            onToggle={() => setMobileApiExpanded((value) => !value)}
          >
            <p className="mb-4 text-xs text-zinc-500">
              Время отклика JSON API и оболочки app.fuji.ru с сервера мониторинга. Это не UX
              приложения на устройстве — для реальной скорости см. блок выше (Firebase Performance).
            </p>
            <MonitoringAlertsBar
              slowCount={countSlowMetrics(mobileApiPages)}
              notifyEnabled={notifyEnabled}
              onEnableNotifications={() => void enableBrowserNotifications()}
            />
            <div className="mb-4">
              <DateRangeFilter
                dateFrom={monitorDateFrom}
                dateTo={monitorDateTo}
                onDateFromChange={setMonitorDateFrom}
                onDateToChange={setMonitorDateTo}
                onClear={() => {
                  setMonitorDateFrom(defaultMonitorDateFrom());
                  setMonitorDateTo(defaultMonitorDateTo());
                }}
              />
            </div>
            <MonitoringMetricsGrid
              items={mobileApiPages}
              selectedKey={selectedMobileApi ? pageKey(selectedMobileApi) : null}
              onSelect={setMobileApiSelectedKey}
              loading={loading && !report}
            />
            {selectedMobileApi ? (
              <MetricDetailPanel item={selectedMobileApi} updatedAt={updatedAt} />
            ) : loading && !report ? (
              <ChartSkeleton compact />
            ) : mobileApiPages.length === 0 ? (
              <EmptyHint text="Данные готовятся. Показатели появятся после первой пробы (каждые 10 минут)." />
            ) : null}
          </ExpandableCard>
        </div>
      )}
    </main>
  );
}

function SlowMetricsBadge({ count, thresholdLabel = "1.1 с" }: { count: number; thresholdLabel?: string }) {
  if (count === 0) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
        в норме
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
      {count} выше {thresholdLabel}
    </span>
  );
}

function MonitoringAlertsBar({
  slowCount,
  thresholdLabel = "1.1 с",
  notifyEnabled,
  onEnableNotifications,
}: {
  slowCount: number;
  thresholdLabel?: string;
  notifyEnabled: boolean;
  onEnableNotifications: () => void;
}) {
  const canNotify = typeof window !== "undefined" && "Notification" in window;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-xs text-zinc-500">
        Норма: <span className="text-zinc-300">≤ {thresholdLabel}</span>
        {slowCount > 0 ? (
          <span className="ml-2 text-amber-300">
            · {slowCount} показател{slowCount === 1 ? "ь" : slowCount < 5 ? "я" : "ей"} выше нормы
          </span>
        ) : (
          <span className="ml-2 text-emerald-300">· все в норме</span>
        )}
      </p>
      {canNotify && !notifyEnabled ? (
        <button
          type="button"
          onClick={onEnableNotifications}
          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-400/60"
        >
          Включить уведомления браузера
        </button>
      ) : canNotify && notifyEnabled ? (
        <span className="text-xs text-emerald-300">Уведомления включены</span>
      ) : null}
    </div>
  );
}

function ExpandableCard({
  title,
  summary,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">{title}</span>
            {badge}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500">{summary}</div>
        </div>
        <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded ? <div className="border-t border-zinc-800 p-4">{children}</div> : null}
    </article>
  );
}

function MonitoringMetricsGrid({
  items,
  selectedKey,
  onSelect,
  loading,
}: {
  items: HistoryPageMetric[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  loading: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">Показатели</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: pageSize }, (_, idx) => <DataTileSkeleton key={`skeleton-${idx}`} />)
        ) : items.length === 0 ? (
          <EmptyHint text="данные готовятся" />
        ) : (
          items.map((item) => (
            <DataTile
              key={pageKey(item)}
              item={item}
              selected={selectedKey === pageKey(item)}
              onClick={() => onSelect(pageKey(item))}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MetricDetailPanel({
  item,
  updatedAt,
}: {
  item: HistoryPageMetric;
  updatedAt: string | null;
}) {
  const slow = isMetricSlow(item.currentMs, item.sourceType);
  return (
    <div
      className={`mt-6 rounded-xl border p-5 ${
        slow ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-500">
          {item.metricName} · {item.page}
        </p>
        {slow ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
            выше нормы
          </span>
        ) : null}
      </div>
      <h3 className={`mt-2 text-2xl font-semibold ${slow ? "text-amber-300" : "text-white"}`}>
        {formatTime(item.currentMs)}
      </h3>
      <PerformanceChart points={item.chart} sourceType={item.sourceType} />
      <div className="mt-4 flex flex-wrap gap-8 text-sm">
        <MetricLegend
          label="среднее за период"
          value={formatTime(item.currentMs)}
          color={slow ? "bg-amber-400" : "bg-blue-400"}
          valueClass={slow ? "text-amber-300" : undefined}
        />
        <MetricLegend label="сэмплы" value={String(item.samples)} color="bg-emerald-400" />
        {updatedAt ? (
          <MetricLegend
            label="обновлено"
            value={new Date(updatedAt).toLocaleTimeString("ru-RU")}
            color="bg-zinc-700"
          />
        ) : null}
      </div>
      <WeeklySummaryTable rows={item.weekly} sourceType={item.sourceType} />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-500">
      {text}
    </div>
  );
}

function countSlowMetrics(items: HistoryPageMetric[]) {
  return items.filter((item) => isMetricSlow(item.currentMs, item.sourceType)).length;
}

function DataTileSkeleton() {
  return (
    <div className="h-24 w-28 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-2">
      <div className="h-2 w-16 rounded bg-zinc-800" />
      <div className="mt-3 h-3 w-20 rounded bg-zinc-800" />
      <div className="mt-2 h-3 w-14 rounded bg-zinc-800" />
      <div className="mt-5 flex justify-between">
        <div className="h-4 w-8 rounded bg-zinc-800" />
        <div className="h-3 w-8 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

function DataTile({
  item,
  selected,
  onClick,
}: {
  item: HistoryPageMetric;
  selected: boolean;
  onClick: () => void;
}) {
  const slow = isMetricSlow(item.currentMs, item.sourceType);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-24 w-full rounded-lg border p-2 text-left transition ${
        selected
          ? slow
            ? "border-amber-400 bg-amber-400/15"
            : "border-emerald-400 bg-emerald-400/20"
          : slow
            ? "border-amber-500/50 bg-amber-500/10 hover:border-amber-400/70"
            : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
      }`}
      title={`${item.metricName}: ${item.page}`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="truncate text-[10px] text-zinc-500">{item.metricName}</div>
        {slow ? <span className="text-[9px] font-semibold uppercase text-amber-300">!</span> : null}
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-zinc-200">{item.page}</div>
      <div className="mt-2 flex items-end justify-between">
        <span
          className={
            slow ? "text-sm font-semibold text-amber-300" : "text-sm font-semibold text-emerald-300"
          }
        >
          {formatTime(item.currentMs)}
        </span>
        <span className="text-[11px] text-zinc-400">{item.samples}</span>
      </div>
    </button>
  );
}

function MetricLegend({
  label,
  value,
  color,
  valueClass,
}: {
  label: string;
  value: string;
  color: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-zinc-500">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </div>
      <p className={`mt-1 text-lg font-semibold ${valueClass ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function WeeklySummaryTable({
  rows,
  sourceType,
}: {
  rows: HistoryPageMetric["weekly"];
  sourceType: PerformanceSourceType;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Неделя</th>
            <th className="px-4 py-3 font-medium">Среднее</th>
            <th className="px-4 py-3 font-medium">Минимум</th>
            <th className="px-4 py-3 font-medium">Максимум</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-3 text-zinc-300">{row.label}</td>
              <td className={`px-4 py-3 ${isMetricSlow(row.avgMs, sourceType) ? "font-medium text-amber-300" : "text-zinc-400"}`}>
                {formatTime(row.avgMs)}
              </td>
              <td className="px-4 py-3 text-zinc-400">{formatTime(row.minMs)}</td>
              <td className={`px-4 py-3 ${isMetricSlow(row.maxMs, sourceType) ? "font-medium text-amber-300" : "text-zinc-400"}`}>
                {formatTime(row.maxMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${compact ? "mt-6" : "mt-8"} animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40 p-5`}
    >
      <div className="h-3 w-64 rounded bg-zinc-800" />
      <div className="mt-3 h-7 w-80 rounded bg-zinc-800" />
      <div className="mt-8 h-64 rounded-lg border border-zinc-800 bg-zinc-950" />
    </div>
  );
}

function PerformanceChart({
  points,
  sourceType,
}: {
  points: HistoryChartPoint[];
  sourceType: PerformanceSourceType;
}) {
  const width = 760;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 38, left: 54 };
  const min = 0;
  const max = Math.max(800, ...points.map((point) => point.valueMs ?? 0));
  const span = width - padding.left - padding.right;
  const x = (idx: number) =>
    points.length <= 1
      ? padding.left + span / 2
      : padding.left + (idx * span) / (points.length - 1);
  const labelStep = Math.max(1, Math.ceil(points.length / 12));
  const y = (value: number) =>
    padding.top + ((max - value) * (height - padding.top - padding.bottom)) / (max - min);
  const currentPath = makePath(
    points
      .map((point, idx) =>
        point.valueMs == null ? null : ([x(idx), y(point.valueMs)] as const),
      )
      .filter((point): point is readonly [number, number] => point != null),
  );

  return (
    <div className="mt-8 overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {makeTicks(max).map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(39 39 42)"
              strokeWidth="1"
            />
            <text x={8} y={y(tick) + 4} fill="rgb(113 113 122)" fontSize="12">
              {tick === 0 ? "0s" : `${tick} ms`}
            </text>
          </g>
        ))}
        {currentPath ? (
          <path d={currentPath} fill="none" stroke="#6d7dfc" strokeWidth="3" />
        ) : null}
        {points.map((point, idx) => {
          const date = new Date(point.date);
          const month = date.getUTCMonth();
          const showDay = idx % labelStep === 0 || idx === points.length - 1;
          const isMonthStart =
            idx === 0 || new Date(points[idx - 1]?.date ?? point.date).getUTCMonth() !== month;
          const slow = isMetricSlow(point.valueMs, sourceType);
          return (
            <g key={point.dayIndex}>
              {point.valueMs == null ? null : (
                <circle
                  cx={x(idx)}
                  cy={y(point.valueMs)}
                  r="3.5"
                  fill={slow ? "#fbbf24" : "#6d7dfc"}
                />
              )}
              {showDay ? (
                <text
                  x={x(idx)}
                  y={height - 20}
                  textAnchor="middle"
                  fill="rgb(113 113 122)"
                  fontSize="11"
                >
                  {date.getUTCDate()}
                </text>
              ) : null}
              {isMonthStart ? (
                <text
                  x={x(idx)}
                  y={height - 5}
                  textAnchor="middle"
                  fill="rgb(161 161 170)"
                  fontSize="11"
                  fontWeight="600"
                >
                  {MONTHS_RU[month]}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function makePath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  return points
    .map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

function formatTime(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const rounded = Math.round(ms);
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${rounded} ms`;
}

function makeTicks(max: number): number[] {
  const roundedMax = Math.ceil(max / 200) * 200;
  return Array.from({ length: 5 }, (_, idx) => Math.round((roundedMax / 4) * idx));
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return { error: `Пустой ответ API (${response.status})` } as T;
  }
  return JSON.parse(text) as T;
}

function pageKey(item: HistoryPageMetric): string {
  return `${item.metricName}:${item.app}:${item.page}`;
}

function defaultMonitorDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toInputDate(date);
}

function defaultMonitorDateTo() {
  return toInputDate(new Date());
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DateRangeFilter({
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
  const isDefault =
    dateFrom === defaultMonitorDateFrom() && dateTo === defaultMonitorDateTo();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-xs text-zinc-500">Период</span>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        От
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        До
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => onDateToChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      {!isDefault ? (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}
