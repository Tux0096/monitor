"use client";

import { useCallback, useEffect, useState } from "react";

import type { CourierStatWeek } from "@/lib/courier-stat-weeks";

type Summary = {
  weeks: number;
  ordersTotal: number;
  appealsMobileApp: number;
  normAppeals: number;
  deviation: number;
  actualRatioPercent: number | null;
  weeksWithinNorm: number;
};

function formatWeekRange(week: CourierStatWeek): string {
  const format = (value: string) =>
    new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${format(week.weekStart)} — ${format(week.weekEnd)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DeviationBadge({ week }: { week: CourierStatWeek }) {
  if (week.deviation == null) {
    return <span className="text-zinc-600">—</span>;
  }
  const withinNorm = week.deviation <= 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        withinNorm
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {week.deviation > 0 ? `+${week.deviation}` : week.deviation} ·{" "}
      {withinNorm ? "в норме" : "превышение"}
    </span>
  );
}

function OrdersInput({
  week,
  disabled,
  onSave,
}: {
  week: CourierStatWeek;
  disabled: boolean;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(week.ordersTotal?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(week.ordersTotal?.toString() ?? "");
  }, [week.ordersTotal]);

  if (week.status === "closed") {
    return <span className="tabular-nums">{week.ordersTotal ?? "—"}</span>;
  }

  const dirty = value !== (week.ordersTotal?.toString() ?? "");

  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={value}
        disabled={disabled || saving}
        onChange={(event) => setValue(event.target.value)}
        placeholder="—"
        className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm tabular-nums text-zinc-100 disabled:opacity-50"
      />
      {dirty ? (
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 0) return;
            setSaving(true);
            try {
              await onSave(parsed);
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-lg border border-sky-700 bg-sky-500/10 px-2 py-1 text-xs text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
        >
          Сохранить
        </button>
      ) : null}
    </span>
  );
}

export function WeeksPanel({ isAdmin }: { isAdmin: boolean }) {
  const [weeks, setWeeks] = useState<CourierStatWeek[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [weeksResponse, summaryResponse] = await Promise.all([
        fetch("/api/courier-stats/weeks", { cache: "no-store" }),
        fetch("/api/courier-stats/summary", { cache: "no-store" }),
      ]);
      if (!weeksResponse.ok) throw new Error("Не удалось загрузить недели");
      const weeksData = (await weeksResponse.json()) as { weeks: CourierStatWeek[] };
      setWeeks(weeksData.weeks);
      if (summaryResponse.ok) {
        const summaryData = (await summaryResponse.json()) as { summary: Summary };
        setSummary(summaryData.summary);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (id: string, path: string, init?: RequestInit) => {
      setBusyId(id);
      setError(null);
      try {
        const response = await fetch(path, init);
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Операция не удалась");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const createWeek = useCallback(async () => {
    setBusyId("new");
    setError(null);
    try {
      const response = await fetch("/api/courier-stats/weeks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Не удалось сформировать неделю");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  if (loading) {
    return <p className="p-4 text-sm text-zinc-500">Загружаем недели…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-white">Недельные нормы обращений</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Норма — 0.02 % обращений от количества заказов. В зачёт идут только
              обращения с категорией «Мобильное приложение». В сводные показатели
              попадают только закрытые недели.
            </p>
          </div>
          <button
            type="button"
            onClick={createWeek}
            disabled={busyId === "new"}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
          >
            Сформировать неделю
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-900 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </section>

      {summary && summary.weeks > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Закрытых недель", value: summary.weeks },
            { label: "Заказов", value: summary.ordersTotal.toLocaleString("ru-RU") },
            { label: "Обращений (МП)", value: summary.appealsMobileApp },
            { label: "Норма", value: summary.normAppeals },
            {
              label: "Факт, %",
              value:
                summary.actualRatioPercent == null
                  ? "—"
                  : `${summary.actualRatioPercent.toFixed(3)} %`,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                {card.label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-white">
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Неделя</th>
              <th className="px-4 py-3 text-left font-medium">Период</th>
              <th className="px-4 py-3 text-left font-medium">Заказы</th>
              <th className="px-4 py-3 text-right font-medium">Обращений (МП)</th>
              <th className="px-4 py-3 text-right font-medium">Норма</th>
              <th className="px-4 py-3 text-left font-medium">Отклонение</th>
              <th className="px-4 py-3 text-left font-medium">Статус</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {weeks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Недель пока нет. Нажмите «Сформировать неделю».
                </td>
              </tr>
            ) : null}

            {weeks.map((week) => {
              const busy = busyId === week.id;
              const canClose = week.status === "draft" && week.ordersTotal != null;

              return (
                <tr key={week.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3 font-medium text-zinc-200">{week.label}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatWeekRange(week)}</td>
                  <td className="px-4 py-3">
                    <OrdersInput
                      week={week}
                      disabled={busy}
                      onSave={(value) =>
                        act(week.id, `/api/courier-stats/weeks/${week.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ordersTotal: value }),
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-200">
                    {week.appealsMobileApp ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                    {week.normAppeals ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DeviationBadge week={week} />
                  </td>
                  <td className="px-4 py-3">
                    {week.status === "closed" ? (
                      <span
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                        title={`Закрыл ${week.closedBy ?? "—"} · ${formatDateTime(week.closedAt)}`}
                      >
                        закрыта
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                        черновик
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {week.status === "draft" ? (
                      <button
                        type="button"
                        disabled={busy || !canClose}
                        title={
                          canClose
                            ? undefined
                            : "Сначала укажите количество заказов за неделю"
                        }
                        onClick={() =>
                          act(week.id, `/api/courier-stats/weeks/${week.id}/close`, {
                            method: "POST",
                          })
                        }
                        className="rounded-lg border border-emerald-800 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Закрыть неделю
                      </button>
                    ) : isAdmin ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(week.id, `/api/courier-stats/weeks/${week.id}/reopen`, {
                            method: "POST",
                          })
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Переоткрыть
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-600">
        У закрытой недели показатели зафиксированы снапшотом на момент закрытия —
        последующее слияние или переклассификация обращений её не меняют.
      </p>
    </div>
  );
}
