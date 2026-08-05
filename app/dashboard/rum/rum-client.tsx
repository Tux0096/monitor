"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  RumIngestHealth,
  RumMetricName,
  RumMetricSummary,
  RumReport,
} from "@/lib/rum-service-client";

const METRIC_LABELS: Record<RumMetricName, string> = {
  LCP: "Отрисовка главного элемента",
  INP: "Отклик на действие",
  CLS: "Скачки вёрстки",
  TTFB: "Ответ сервера",
  FCP: "Первая отрисовка",
};

const STATUS_STYLES = {
  good: "border-emerald-800 bg-emerald-500/5",
  "needs-improvement": "border-amber-800 bg-amber-500/5",
  poor: "border-rose-800 bg-rose-500/5",
  "no-data": "border-zinc-800 bg-zinc-950",
} as const;

const STATUS_TEXT = {
  good: "text-emerald-400",
  "needs-improvement": "text-amber-400",
  poor: "text-rose-400",
  "no-data": "text-zinc-600",
} as const;

const STATUS_LABEL = {
  good: "в норме",
  "needs-improvement": "требует внимания",
  poor: "плохо",
  "no-data": "нет данных",
} as const;

function formatValue(value: number | null, unit: "ms" | "score"): string {
  if (value == null) return "—";
  if (unit === "score") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} с`;
  return `${Math.round(value)} мс`;
}

function MetricCard({ metric }: { metric: RumMetricSummary }) {
  return (
    <div className={`rounded-2xl border p-4 ${STATUS_STYLES[metric.status]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{metric.metric}</div>
        <span className={`text-[11px] ${STATUS_TEXT[metric.status]}`}>
          {STATUS_LABEL[metric.status]}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">{METRIC_LABELS[metric.metric]}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {formatValue(metric.p75, metric.unit)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>p50 {formatValue(metric.p50, metric.unit)}</span>
        <span>p95 {formatValue(metric.p95, metric.unit)}</span>
        <span>норма ≤ {formatValue(metric.good, metric.unit)}</span>
        <span>{metric.samples.toLocaleString("ru-RU")} замеров</span>
      </div>
    </div>
  );
}

function IngestBanner({ ingest }: { ingest: RumIngestHealth | null }) {
  if (!ingest) return null;

  if (ingest.last24h === 0) {
    return (
      <div className="rounded-2xl border border-amber-900 bg-amber-500/5 p-4 text-sm text-amber-300">
        За сутки не пришло ни одного события. Скрипт не подключён, либо origin
        не попал в <code className="text-amber-200">RUM_ALLOWED_ORIGINS</code> коллектора.
      </div>
    );
  }

  const platforms = ingest.bySource
    .map((row) => `${row.source}/${row.platform}: ${row.count.toLocaleString("ru-RU")}`)
    .join(" · ");

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
      За сутки {ingest.last24h.toLocaleString("ru-RU")} событий, за час{" "}
      {ingest.lastHour.toLocaleString("ru-RU")}, за 5 минут {ingest.last5min}.
      {platforms ? <span className="ml-2 text-zinc-400">{platforms}</span> : null}
    </div>
  );
}

export function RumClient() {
  const [report, setReport] = useState<RumReport | null>(null);
  const [ingest, setIngest] = useState<RumIngestHealth | null>(null);
  const [source, setSource] = useState<"" | "site" | "app">("");
  const [metric, setMetric] = useState<RumMetricName>("LCP");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (source) query.set("source", source);
      const response = await fetch(`/api/rum/report?${query.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Не удалось загрузить данные");
      }
      const data = (await response.json()) as {
        report: RumReport;
        ingest: RumIngestHealth | null;
      };
      setReport(data.report);
      setIngest(data.ingest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!report) return [];
    return report.timeline
      .filter((point) => point.metric === metric)
      .map((point) => ({
        label: new Date(point.hour).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
        }),
        p75: point.p75 == null ? null : Math.round(point.p75 * 1000) / 1000,
        samples: point.samples,
      }));
  }, [report, metric]);

  const pathRows = useMemo(() => {
    if (!report) return [];
    return report.byPathGroup
      .filter((row) => row.metric === metric)
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0))
      .slice(0, 15);
  }, [report, metric]);

  const unit = report?.summary.find((s) => s.metric === metric)?.unit ?? "ms";

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Реальные пользователи</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Скорость загрузки</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-500">
            Замеры с устройств реальных пользователей сайта и приложения.
            Показывается p75 — значение, хуже которого видят четверть посетителей.
            Среднее здесь не используется: один медленный запрос искажает его целиком.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
        >
          Обновить
        </button>
      </div>

      <section className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          {([
            { key: "", label: "Всё" },
            { key: "site", label: "Сайт" },
            { key: "app", label: "Приложение" },
          ] as const).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSource(option.key)}
              className={
                source === option.key
                  ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
                  : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <p className="mb-4 rounded-2xl border border-rose-900 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-sm text-zinc-500">
          Загружаем…
        </div>
      ) : report ? (
        <div className="space-y-6">
          <IngestBanner ingest={ingest} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {report.summary.map((item) => (
              <button
                key={item.metric}
                type="button"
                onClick={() => setMetric(item.metric)}
                className={`text-left transition ${
                  metric === item.metric ? "ring-1 ring-sky-600 rounded-2xl" : ""
                }`}
              >
                <MetricCard metric={item} />
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="text-sm font-medium text-white">
              {metric} · p75 по часам
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{METRIC_LABELS[metric]}</p>
            <div className="mt-4 h-72">
              {chartData.length === 0 ? (
                <p className="pt-16 text-center text-sm text-zinc-600">
                  Данных за период нет
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#52525b" fontSize={11} minTickGap={40} />
                    <YAxis stroke="#52525b" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "#09090b",
                        border: "1px solid #3f3f46",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => formatValue(value, unit)}
                    />
                    <Line
                      type="monotone"
                      dataKey="p75"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-white">Самые медленные страницы</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {metric}, p75. Показаны группы, где набралось не менее 20 замеров.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Страница</th>
                  <th className="px-4 py-3 text-right font-medium">p75</th>
                  <th className="px-4 py-3 text-right font-medium">Замеров</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {pathRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-zinc-600">
                      Пока недостаточно данных
                    </td>
                  </tr>
                ) : null}
                {pathRows.map((row) => (
                  <tr key={row.pathGroup} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                      {row.pathGroup}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-200">
                      {formatValue(row.p75, unit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                      {row.samples.toLocaleString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </main>
  );
}
