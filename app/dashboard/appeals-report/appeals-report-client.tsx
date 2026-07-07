"use client";

import {
  APPEAL_INTAKE_SOURCES,
  APPEAL_RESOLUTION_METHODS,
  getAppealIntakeSource,
} from "@/lib/appeal-intake-sources";
import type { AppealReportRow } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

function defaultFromDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

export function AppealsReportClient() {
  const [rows, setRows] = useState<AppealReportRow[]>([]);
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    incident: "",
    pointId: "",
    intakeSourceCode: "phone",
    initiatorName: "",
    initiatorLastName: "",
    phone: "",
    assignee: "",
    contractor: "",
    itComment: "",
  });

  const [editForm, setEditForm] = useState({
    intakeSourceCode: "",
    pointId: "",
    assignee: "",
    contractor: "",
    resolutionMethod: "",
    itComment: "",
    status: "open",
    inProgressAt: "",
    closedAt: "",
  });

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const response = await fetch(`/api/appeals/report?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        setError("Не удалось загрузить отчёт");
        return;
      }
      const data = (await response.json()) as { rows: AppealReportRow[] };
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void fetch("/api/points", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { points?: DeliveryPoint[] } | null) => {
        if (data?.points) setPoints(data.points.filter((point) => point.isActive));
      });
  }, []);

  const summary = useMemo(() => {
    const open = rows.filter((row) => row.status !== "closed").length;
    const closed = rows.filter((row) => row.status === "closed").length;
    return { total: rows.length, open, closed };
  }, [rows]);

  async function createAppeal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          pointId: createForm.pointId || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Не удалось создать обращение");
        return;
      }
      setShowCreate(false);
      setCreateForm({
        incident: "",
        pointId: "",
        intakeSourceCode: "phone",
        initiatorName: "",
        initiatorLastName: "",
        phone: "",
        assignee: "",
        contractor: "",
        itComment: "",
      });
      await loadReport();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: AppealReportRow) {
    setEditId(row.id);
    setEditForm({
      intakeSourceCode: row.intakeSourceCode ?? "manual",
      pointId: points.find((point) => point.name === row.pointName)?.id ?? "",
      assignee: row.assignee ?? "",
      contractor: row.contractor ?? "",
      resolutionMethod: row.resolutionMethod ?? "",
      itComment: row.itComment ?? "",
      status: row.status,
      inProgressAt: row.inProgressAt ? row.inProgressAt.slice(0, 16) : "",
      closedAt: row.resolvedAt ? row.resolvedAt.slice(0, 16) : "",
    });
  }

  async function saveEdit(row: AppealReportRow) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appeals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeSourceCode: editForm.intakeSourceCode || null,
          pointId: editForm.pointId || null,
          assignee: editForm.assignee || null,
          contractor: editForm.contractor || null,
          resolutionMethod: editForm.resolutionMethod || null,
          itComment: editForm.itComment || null,
          status: editForm.status,
          resultText:
            editForm.status === "closed"
              ? editForm.itComment || "Закрыто из отчёта IT"
              : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Не удалось сохранить");
        return;
      }
      setEditId(null);
      await loadReport();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Техническая поддержка</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Отчёт по обращениям</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Журнал инцидентов IT: Telegram и ручные обращения. Обращения курьеров из MAX здесь не
            показываются. Сообщения администраторов не регистрируются как обращения.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
          >
            {showCreate ? "Скрыть форму" : "Создать обращение"}
          </button>
          <button
            type="button"
            onClick={() => void loadReport()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Обновить
          </button>
        </div>
      </div>

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
        <div className="ml-auto flex gap-4 text-sm text-zinc-400">
          <span>Всего: {summary.total}</span>
          <span className="text-amber-300">Открыто: {summary.open}</span>
          <span className="text-emerald-300">Закрыто: {summary.closed}</span>
        </div>
      </section>

      {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}

      {showCreate ? (
        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-lg font-medium text-white">Новое обращение</h2>
          <form onSubmit={createAppeal} className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block text-sm text-zinc-400 lg:col-span-2">
              Инцидент
              <textarea
                required
                value={createForm.incident}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, incident: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                placeholder="Нет подключения к 1С на точке..."
              />
            </label>
            <label className="block text-sm text-zinc-400">
              Точка
              <select
                value={createForm.pointId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, pointId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">— не указана —</option>
                {points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-zinc-400">
              Источник
              <select
                value={createForm.intakeSourceCode}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, intakeSourceCode: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                {APPEAL_INTAKE_SOURCES.map((source) => (
                  <option key={source.code} value={source.code}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-zinc-400">
              Инициатор
              <input
                value={createForm.initiatorName}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, initiatorName: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-400">
              Фамилия
              <input
                value={createForm.initiatorLastName}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, initiatorLastName: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-400">
              Исполнитель
              <input
                value={createForm.assignee}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, assignee: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-400">
              Подрядчик
              <input
                value={createForm.contractor}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, contractor: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block text-sm text-zinc-400 lg:col-span-2">
              Комментарий IT
              <textarea
                value={createForm.itComment}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, itComment: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
              >
                {saving ? "Сохраняем…" : "Зарегистрировать обращение"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        {loading ? (
          <div className="p-8 text-sm text-zinc-500">Загружаем отчёт…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">За выбранный период обращений нет.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Дата</th>
                  <th className="px-3 py-3">Точка</th>
                  <th className="px-3 py-3 min-w-[220px]">Инцидент</th>
                  <th className="px-3 py-3 w-[5.5rem]">Источник</th>
                  <th className="px-3 py-3">Инициатор</th>
                  <th className="px-3 py-3">Поступило</th>
                  <th className="px-3 py-3">В работе</th>
                  <th className="px-3 py-3">Решено</th>
                  <th className="px-3 py-3">Способ</th>
                  <th className="px-3 py-3">Исполнитель</th>
                  <th className="px-3 py-3">Подрядчик</th>
                  <th className="px-3 py-3">Реагир.</th>
                  <th className="px-3 py-3">Решение</th>
                  <th className="px-3 py-3">Общее</th>
                  <th className="px-3 py-3 min-w-[160px]">Комментарий IT</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const source = getAppealIntakeSource(row.intakeSourceCode);
                  const resolution = APPEAL_RESOLUTION_METHODS.find(
                    (item) => item.code === row.resolutionMethod,
                  );
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-zinc-900 align-top hover:bg-zinc-900/40">
                        <td className="px-3 py-3 whitespace-nowrap text-zinc-300">
                          {formatDate(row.receivedAt)}
                        </td>
                        <td className="px-3 py-3 text-zinc-300">{row.pointName ?? "—"}</td>
                        <td className="px-3 py-3 text-zinc-200">
                          <div className="font-medium text-zinc-400">№{row.appealNumber}</div>
                          {row.incident}
                        </td>
                        <td className="px-3 py-3 w-[5.5rem] max-w-[5.5rem]">
                          <span
                            title={source?.label ?? row.intakeSourceLabel}
                            className={`block truncate rounded border px-1.5 py-0.5 text-center text-[11px] leading-tight ${source?.badgeClass ?? "border-zinc-700 text-zinc-400"}`}
                          >
                            {source?.shortLabel ?? row.intakeSourceLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-300">{row.initiator}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                          {formatDateTime(row.receivedAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                          {formatDateTime(row.inProgressAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                          {formatDateTime(row.resolvedAt)}
                        </td>
                        <td className="px-3 py-3">
                          {resolution ? (
                            <span
                              title={row.resolutionMethodLabel}
                              className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${resolution.badgeClass}`}
                            >
                              {row.resolutionMethodLabel}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 text-zinc-300">{row.assignee ?? "—"}</td>
                        <td className="px-3 py-3 text-zinc-300">{row.contractor ?? "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-400">
                          {row.responseTimeLabel}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-400">
                          {row.resolveTimeLabel}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-400">
                          {row.totalTimeLabel}
                        </td>
                        <td className="px-3 py-3 text-zinc-400">{row.itComment ?? "—"}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="text-xs text-sky-400 hover:text-sky-300"
                          >
                            Изменить
                          </button>
                        </td>
                      </tr>
                      {editId === row.id ? (
                        <tr key={`${row.id}-edit`} className="border-b border-zinc-900 bg-zinc-900/60">
                          <td colSpan={16} className="px-4 py-4">
                            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                              <label className="text-xs text-zinc-500">
                                Источник
                                <select
                                  value={editForm.intakeSourceCode}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      intakeSourceCode: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                >
                                  {APPEAL_INTAKE_SOURCES.map((source) => (
                                    <option key={source.code} value={source.code}>
                                      {source.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-zinc-500">
                                Точка
                                <select
                                  value={editForm.pointId}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, pointId: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                >
                                  <option value="">—</option>
                                  {points.map((point) => (
                                    <option key={point.id} value={point.id}>
                                      {point.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-zinc-500">
                                Статус
                                <select
                                  value={editForm.status}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      status: e.target.value,
                                      inProgressAt:
                                        e.target.value === "in_progress" && !prev.inProgressAt
                                          ? new Date().toISOString().slice(0, 16)
                                          : prev.inProgressAt,
                                    }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                >
                                  <option value="open">Открыто</option>
                                  <option value="in_progress">В работе</option>
                                  <option value="closed">Закрыто</option>
                                </select>
                              </label>
                              <label className="text-xs text-zinc-500">
                                Способ решения
                                <select
                                  value={editForm.resolutionMethod}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      resolutionMethod: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                >
                                  <option value="">—</option>
                                  {APPEAL_RESOLUTION_METHODS.map((method) => (
                                    <option key={method.code} value={method.code}>
                                      {method.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-zinc-500">
                                Исполнитель
                                <input
                                  value={editForm.assignee}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, assignee: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="text-xs text-zinc-500">
                                Подрядчик
                                <input
                                  value={editForm.contractor}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, contractor: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="text-xs text-zinc-500">
                                Взято в работу
                                <input
                                  type="datetime-local"
                                  value={editForm.inProgressAt}
                                  readOnly
                                  title="Время проставляется автоматически при переводе в «В работе»"
                                  className="mt-1 w-full cursor-default rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-400"
                                />
                              </label>
                              <label className="text-xs text-zinc-500 md:col-span-2">
                                Комментарий IT
                                <input
                                  value={editForm.itComment}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, itComment: e.target.value }))
                                  }
                                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveEdit(row)}
                                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500"
                              >
                                Сохранить
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditId(null)}
                                className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
                              >
                                Отмена
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
