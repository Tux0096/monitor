"use client";

import type {
  HistoryChartPoint,
  HistoryPageMetric,
  PerformanceHistoryReport,
} from "@/lib/firebase-performance-history";
import type {
  AppealsAnalyticsReport,
  AppealAnalyticsRow,
} from "@/lib/appeals";
import type { MonitorSnapshot } from "@/lib/types";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ApiErrorPayload = {
  error?: string;
  hint?: string;
};

const pageSize = 4;
const METRIC_SLOW_MS = 1100;

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

type AppealsAnalyticsResponse = {
  rows: AppealAnalyticsRow[];
  report: AppealsAnalyticsReport;
};

type AppealsDetailKey = "quality" | "categories" | "users" | "weekly";

export function DashboardClient({}: { initial: MonitorSnapshot }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [report, setReport] = useState<PerformanceHistoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [siteExpanded, setSiteExpanded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [appealsExpanded, setAppealsExpanded] = useState(false);
  const [siteSelectedKey, setSiteSelectedKey] = useState<string | null>(null);
  const [mobileSelectedKey, setMobileSelectedKey] = useState<string | null>(null);
  const [monitorDateFrom, setMonitorDateFrom] = useState(() => defaultAppealsDateFrom());
  const [monitorDateTo, setMonitorDateTo] = useState(() => defaultAppealsDateTo());
  const [appealRows, setAppealRows] = useState<AppealAnalyticsRow[]>([]);
  const [appealReport, setAppealReport] = useState<AppealsAnalyticsReport | null>(null);
  const [appealsDetailKey, setAppealsDetailKey] = useState<AppealsDetailKey | null>(null);
  const [appealsDateFrom, setAppealsDateFrom] = useState(() => defaultAppealsDateFrom());
  const [appealsDateTo, setAppealsDateTo] = useState(() => defaultAppealsDateTo());
  const [appealsLoading, setAppealsLoading] = useState(false);
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

    const slowNow = report.pages.filter((page) => isSlowMetric(page.currentMs));
    const newlySlow = slowNow.filter((page) => !prevSlowKeysRef.current.has(pageKey(page)));
    if (newlySlow.length === 0) {
      prevSlowKeysRef.current = new Set(slowNow.map(pageKey));
      return;
    }

    if (newlySlow.length === 1) {
      const item = newlySlow[0]!;
      new Notification("Показатель выше нормы", {
        body: `${item.metricName}: ${formatTime(item.currentMs)} · норма 1.1 с\n${item.page}`,
        tag: `slow-${pageKey(item)}`,
      });
    } else {
      new Notification("Показатели выше нормы", {
        body: `${newlySlow.length} показателей превысили 1.1 с\n${newlySlow
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

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    async function loadAppeals() {
      setAppealsLoading(true);
      try {
        const params = new URLSearchParams();
        if (appealsDateFrom) params.set("from", appealsDateFrom);
        if (appealsDateTo) params.set("to", appealsDateTo);
        const query = params.toString();
        const response = await fetch(
          `/api/appeals/analytics${query ? `?${query}` : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as AppealsAnalyticsResponse;
        if (!cancelled) {
          setAppealRows(data.rows);
          setAppealReport(data.report);
        }
      } finally {
        if (!cancelled) setAppealsLoading(false);
      }
    }
    void loadAppeals();
    const interval = window.setInterval(() => void loadAppeals(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.user, appealsDateFrom, appealsDateTo]);

  async function logout() {
    await signOut({ callbackUrl: "/login" });
    router.refresh();
  }

  const sitePages = (report?.pages ?? []).filter((page) => page.sourceType === "site");
  const mobilePages = (report?.pages ?? []).filter((page) => page.sourceType === "mobile");
  const selectedSite =
    sitePages.find((page) => pageKey(page) === siteSelectedKey) ?? sitePages[0] ?? null;
  const selectedMobile =
    mobilePages.find((page) => pageKey(page) === mobileSelectedKey) ?? mobilePages[0] ?? null;

  const appealsSummary = useMemo(
    () => summarizeAppeals(appealRows, appealReport),
    [appealRows, appealReport],
  );

  const appealsPeriodLabel = formatAppealsPeriodLabel(appealsDateFrom, appealsDateTo);

  function toggleAppealsExpanded() {
    setAppealsExpanded((current) => {
      const next = !current;
      if (next && !appealsDetailKey) setAppealsDetailKey("quality");
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-zinc-900 pb-5">
        <div>
          <p className="text-xs text-zinc-600">Фуджи · Performance</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Аналитика</h1>
        </div>
        <div className="flex items-center gap-4">
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
                <SlowMetricsBadge count={countSlowMetrics(sitePages)} />
              ) : null
            }
            expanded={siteExpanded}
            onToggle={() => setSiteExpanded((value) => !value)}
          >
            <MonitoringAlertsBar
              slowCount={countSlowMetrics(sitePages)}
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
                  setMonitorDateFrom(defaultAppealsDateFrom());
                  setMonitorDateTo(defaultAppealsDateTo());
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
                  setMonitorDateFrom(defaultAppealsDateFrom());
                  setMonitorDateTo(defaultAppealsDateTo());
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
              <EmptyHint text="Данные готовятся. Показатели появятся после первой загрузки." />
            ) : null}
          </ExpandableCard>

          <ExpandableCard
            title="Обращения"
            summary={`${appealsSummary.total} за период · ${appealsSummary.open} открытых · ${appealsSummary.categories} категорий`}
            badge={
              appealsSummary.total > 0 ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                  {appealsSummary.closed} закрыто
                </span>
              ) : null
            }
            expanded={appealsExpanded}
            onToggle={toggleAppealsExpanded}
          >
            <DateRangeFilter
              dateFrom={appealsDateFrom}
              dateTo={appealsDateTo}
              onDateFromChange={setAppealsDateFrom}
              onDateToChange={setAppealsDateTo}
              onClear={() => {
                setAppealsDateFrom(defaultAppealsDateFrom());
                setAppealsDateTo(defaultAppealsDateTo());
              }}
            />

            {appealsLoading ? (
              <div className="mt-4 text-sm text-zinc-500">Обновляем данные…</div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatBlock
                label="Показатели продуктов"
                value={appealsSummary.qualityTotal}
                hint={appealsPeriodLabel}
                active={appealsDetailKey === "quality"}
                onClick={() => setAppealsDetailKey("quality")}
              />
              <StatBlock
                label="Категории"
                value={appealsSummary.categories}
                hint="типов проблем"
                active={appealsDetailKey === "categories"}
                onClick={() => setAppealsDetailKey("categories")}
              />
              <StatBlock
                label="Курьеры"
                value={appealsSummary.couriers}
                hint="с повторами"
                active={appealsDetailKey === "users"}
                onClick={() => setAppealsDetailKey("users")}
              />
              <StatBlock
                label="По неделям"
                value={appealsSummary.total}
                hint={appealsPeriodLabel}
                active={appealsDetailKey === "weekly"}
                onClick={() => setAppealsDetailKey("weekly")}
              />
            </div>

            {appealsDetailKey === "quality" && appealReport ? (
              <div className="mt-5">
                <AnalyticsMatrix
                  title="Показатели продуктов"
                  weeks={appealReport.weeks}
                  rows={appealReport.qualityRows}
                />
              </div>
            ) : null}

            {appealsDetailKey === "categories" && appealReport ? (
              <div className="mt-5">
                <AnalyticsMatrix
                  title="Категории обращений"
                  weeks={appealReport.weeks}
                  rows={appealReport.categoryRows}
                />
              </div>
            ) : null}

            {appealsDetailKey === "users" && appealReport ? (
              <div className="mt-5">
                <AnalyticsMatrix
                  title="Повторные обращения по курьерам"
                  weeks={appealReport.weeks}
                  rows={appealReport.userRows.slice(0, 12)}
                />
              </div>
            ) : null}

            {appealsDetailKey === "weekly" ? (
              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                <div className="bg-zinc-900/80 px-4 py-3 text-sm font-medium text-zinc-200">
                  Статистика по неделям ({appealsPeriodLabel})
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Неделя</th>
                      <th className="px-4 py-3 font-medium">Всего</th>
                      <th className="px-4 py-3 font-medium">Закрыто</th>
                      <th className="px-4 py-3 font-medium">В работе</th>
                      <th className="px-4 py-3 font-medium">Среднее закрытие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {appealRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                          Данные готовятся
                        </td>
                      </tr>
                    ) : (
                      appealRows.map((row) => (
                        <tr key={row.label}>
                          <td className="px-4 py-3 text-zinc-300">{row.label}</td>
                          <td className="px-4 py-3 text-zinc-400">{row.total}</td>
                          <td className="px-4 py-3 text-zinc-400">{row.closed}</td>
                          <td className="px-4 py-3 text-zinc-400">{row.open}</td>
                          <td className="px-4 py-3 text-zinc-400">
                            {row.avgCloseHours == null ? "—" : `${row.avgCloseHours.toFixed(1)} ч`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!appealsDetailKey ? (
              <EmptyHint text="Нажмите на блок показателя, чтобы открыть детализацию." />
            ) : null}
          </ExpandableCard>
        </div>
      )}
    </main>
  );
}

function SlowMetricsBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
        в норме
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
      {count} выше 1.1 с
    </span>
  );
}

function MonitoringAlertsBar({
  slowCount,
  notifyEnabled,
  onEnableNotifications,
}: {
  slowCount: number;
  notifyEnabled: boolean;
  onEnableNotifications: () => void;
}) {
  const canNotify = typeof window !== "undefined" && "Notification" in window;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-xs text-zinc-500">
        Норма: <span className="text-zinc-300">≤ 1.1 с</span>
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

function StatBlock({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl border border-sky-400/50 bg-sky-500/10 p-4 text-left transition hover:border-sky-400/70"
          : "rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:border-zinc-600"
      }
    >
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-zinc-300">{label}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
    </button>
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
  const slow = isSlowMetric(item.currentMs);
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
      <PerformanceChart points={item.chart} />
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
      <WeeklySummaryTable rows={item.weekly} />
    </div>
  );
}

function AnalyticsMatrix({
  title,
  weeks,
  rows,
}: {
  title: string;
  weeks: string[];
  rows: AppealsAnalyticsReport["categoryRows"];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="bg-zinc-900/80 px-4 py-3 text-sm font-medium text-zinc-200">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-blue-500/10 text-xs text-blue-100">
            <tr>
              <th className="min-w-72 px-4 py-3 font-medium">Показатель</th>
              {weeks.length === 0 ? (
                <th className="px-4 py-3 font-medium">Нет данных</th>
              ) : (
                weeks.map((week) => (
                  <th key={week} className="px-4 py-3 font-medium">
                    {week}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={weeks.length + 1} className="px-4 py-6 text-center text-zinc-500">
                  Данные готовятся
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 text-zinc-300">{row.label}</td>
                  {weeks.map((week) => (
                    <td key={week} className="px-4 py-3 text-zinc-400">
                      {row.values[week] ?? 0}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

function summarizeAppeals(rows: AppealAnalyticsRow[], report: AppealsAnalyticsReport | null) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const closed = rows.reduce((sum, row) => sum + row.closed, 0);
  const open = rows.reduce((sum, row) => sum + row.open, 0);
  const categories =
    report?.categoryRows.filter((row) => sumMetricValues(row) > 0).length ?? 0;
  const couriers = report?.userRows.filter((row) => sumMetricValues(row) > 0).length ?? 0;
  const qualityTotal = report
    ? sumMetricValues(report.qualityRows.find((row) => row.key === "total"))
    : total;

  return { total, closed, open, categories, couriers, qualityTotal };
}

function sumMetricValues(row: AppealsAnalyticsReport["qualityRows"][number] | undefined) {
  if (!row) return 0;
  return Object.values(row.values).reduce<number>(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

function countSlowMetrics(items: HistoryPageMetric[]) {
  return items.filter((item) => isSlowMetric(item.currentMs)).length;
}

function isSlowMetric(ms: number | null | undefined) {
  return (ms ?? 0) > METRIC_SLOW_MS;
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
  const slow = isSlowMetric(item.currentMs);
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

function WeeklySummaryTable({ rows }: { rows: HistoryPageMetric["weekly"] }) {
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
              <td className={`px-4 py-3 ${isSlowMetric(row.avgMs) ? "font-medium text-amber-300" : "text-zinc-400"}`}>
                {formatTime(row.avgMs)}
              </td>
              <td className="px-4 py-3 text-zinc-400">{formatTime(row.minMs)}</td>
              <td className={`px-4 py-3 ${isSlowMetric(row.maxMs) ? "font-medium text-amber-300" : "text-zinc-400"}`}>
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

function PerformanceChart({ points }: { points: HistoryChartPoint[] }) {
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
          const slow = isSlowMetric(point.valueMs);
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

function defaultAppealsDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toInputDate(date);
}

function defaultAppealsDateTo() {
  return toInputDate(new Date());
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAppealsPeriodLabel(from: string, to: string) {
  const format = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  };
  return `${format(from)} — ${format(to)}`;
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
    dateFrom === defaultAppealsDateFrom() && dateTo === defaultAppealsDateTo();

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
