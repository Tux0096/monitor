"use client";

import type { CheckResult, MonitorSnapshot } from "@/lib/types";
import type { FirebaseReport } from "@/lib/firebase-report";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function statusLabel(s: CheckResult["status"]): string {
  switch (s) {
    case "ok":
      return "Работает";
    case "degraded":
      return "Ограничено";
    case "down":
      return "Недоступно";
    case "checking":
      return "Проверка…";
    default:
      return s;
  }
}

function statusStyles(s: CheckResult["status"]): string {
  switch (s) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "degraded":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/30";
    case "down":
      return "bg-red-500/15 text-red-300 ring-red-500/35";
    case "checking":
      return "bg-zinc-500/15 text-zinc-300 ring-zinc-500/25";
    default:
      return "bg-zinc-500/15 text-zinc-300";
  }
}

function pickProjectFields(project: Record<string, unknown> | null) {
  if (!project) return [];
  const keys = [
    "displayName",
    "projectId",
    "projectNumber",
    "state",
    "resources",
  ] as const;
  return keys
    .filter((k) => project[k] !== undefined && project[k] !== null)
    .map((k) => ({
      key: k,
      value:
        typeof project[k] === "object"
          ? JSON.stringify(project[k])
          : String(project[k]),
    }));
}

export function DashboardClient({ initial }: { initial: MonitorSnapshot }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [snap, setSnap] = useState<MonitorSnapshot>(initial);
  const [fb, setFb] = useState<FirebaseReport | null>(null);
  const [fbErr, setFbErr] = useState<string | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    (async () => {
      try {
        const r = await fetch("/api/health");
        if (r.ok) {
          setSnap((await r.json()) as MonitorSnapshot);
        }
      } catch {
        /* keep initial */
      }
      es = new EventSource("/api/health/stream");
      es.onmessage = (ev) => {
        try {
          setSnap(JSON.parse(ev.data) as MonitorSnapshot);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        es?.close();
      };
    })();
    return () => es?.close();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const r = await fetch("/api/firebase/snapshot");
        const data = (await r.json()) as FirebaseReport & {
          error?: string;
          hint?: string;
        };
        if (!r.ok) {
          setFbErr(data.hint ?? data.error ?? `Ошибка ${r.status}`);
          setFb(null);
          return;
        }
        setFbErr(null);
        setFb(data);
      } catch (e) {
        setFbErr(e instanceof Error ? e.message : "Ошибка загрузки Firebase");
        setFb(null);
      }
    })();
  }, [session?.user]);

  async function logout() {
    await signOut({ callbackUrl: "/login" });
    router.refresh();
  }

  const ok = snap.results.filter((r) => r.status === "ok").length;
  const total = snap.results.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Дашборд (замена Excel)
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Доступность URL — каждые{" "}
            {snap.meta?.intervalMs
              ? `${snap.meta.intervalMs / 1000} с`
              : "30 с"}
            . Данные Firebase — с вашего аккаунта Google (не из таблицы).
          </p>
          {snap.lastError ? (
            <p className="mt-2 text-sm text-amber-400" role="status">
              Предупреждение: {snap.lastError}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-center">
            <div className="text-2xl font-semibold tabular-nums text-white">
              {ok}/{total}
            </div>
            <div className="text-xs text-zinc-500">URL доступно</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Выйти
          </button>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-white">
          Firebase — выгрузка (Management API)
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Проект:{" "}
          <code className="text-zinc-400">{fb?.projectId ?? "—"}</code>
          . Нужны роли в Google Cloud / Firebase для этого проекта. Метрики
          Crashlytics / Performance как в консоли здесь не дублируются — для них
          нужны отдельные API или экспорт в BigQuery.
        </p>

        {fbErr ? (
          <div
            className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
            role="status"
          >
            {fbErr}
          </div>
        ) : null}

        {fb ? (
          <div className="mt-6 space-y-6">
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Поле</th>
                    <th className="px-4 py-3 font-medium">Значение</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {pickProjectFields(fb.project).map((row) => (
                    <tr key={row.key} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-2 font-medium text-zinc-300">
                        {row.key}
                      </td>
                      <td className="px-4 py-2 break-all text-zinc-400">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                  {pickProjectFields(fb.project).length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-6 text-center text-zinc-500"
                      >
                        Нет данных проекта (проверьте FIREBASE_PROJECT_ID и
                        права аккаунта).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Платформа</th>
                    <th className="px-4 py-3 font-medium">Имя</th>
                    <th className="px-4 py-3 font-medium">App ID</th>
                    <th className="px-4 py-3 font-medium">Пакет / bundle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {fb.apps.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-zinc-500"
                      >
                        Приложения не получены
                      </td>
                    </tr>
                  ) : (
                    fb.apps.map((a) => (
                      <tr key={`${a.platform}-${a.appId}`} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-300">{a.platform}</td>
                        <td className="px-4 py-2 text-zinc-100">
                          {a.displayName || "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                          {a.appId}
                        </td>
                        <td className="px-4 py-2 text-zinc-400">{a.extra}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {fb.apiErrors.length > 0 ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                <p className="font-medium">Ошибки API</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {fb.apiErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-zinc-600">
              Обновлено:{" "}
              {new Date(fb.fetchedAt).toLocaleString("ru-RU", {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </p>
          </div>
        ) : !fbErr ? (
          <p className="mt-4 text-sm text-zinc-500">Загрузка Firebase…</p>
        ) : null}
      </section>

      <h2 className="mt-14 text-lg font-medium text-white">
        Проверки URL (config/targets.json)
      </h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Сервис</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                HTTP
              </th>
              <th className="px-4 py-3 font-medium">Задержка</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                URL
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {snap.results.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-zinc-500"
                >
                  Нет целей в config/targets.json
                </td>
              </tr>
            ) : (
              snap.results.map((r) => (
                <tr key={r.id} className="transition hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100">
                    {r.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums text-zinc-400 sm:table-cell">
                    {r.httpStatus ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-400">
                    {r.latencyMs != null ? `${r.latencyMs} мс` : "—"}
                  </td>
                  <td className="hidden max-w-[220px] truncate px-4 py-3 text-zinc-500 md:table-cell">
                    {r.url}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {snap.results.some((r) => r.error) ? (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          <p className="font-medium text-zinc-300">Детали ошибок URL</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {snap.results
              .filter((r) => r.error)
              .map((r) => (
                <li key={`${r.id}-err`}>
                  <span className="text-zinc-200">{r.name}</span>: {r.error}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
