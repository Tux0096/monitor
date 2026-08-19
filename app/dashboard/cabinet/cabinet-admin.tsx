"use client";

import { useCallback, useEffect, useState } from "react";

import { BenefitsTab, KbTab } from "./cabinet-content";

type LinkRequest = {
  id: number;
  telegram_id: string;
  phone: string | null;
  tg_first_name: string | null;
  tg_username: string | null;
  status: string;
  created_at: string;
};

type NewsRow = {
  id: number;
  title: string;
  lead: string | null;
  is_published: boolean;
  publish_at: string | null;
  audience_id: number | null;
  audience_name: string | null;
  reads: number;
};

type Audience = { id: number; name: string; is_everyone: boolean };

type Tab = "requests" | "news" | "kb" | "benefits" | "audiences";

export function CabinetAdmin() {
  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [news, setNews] = useState<NewsRow[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown | null> => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/cabinet-admin/${path}`, {
          ...init,
          headers: init?.body ? { "Content-Type": "application/json" } : undefined,
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        if (!response.ok) {
          setMessage(data?.detail ?? "Операция не удалась");
          return null;
        }
        return data;
      } catch {
        setMessage("Сервис кабинета не отвечает");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    if (tab === "requests") {
      const data = (await call("link-requests?status=pending")) as {
        items: LinkRequest[];
      } | null;
      setRequests(data?.items ?? []);
    }
    if (tab === "news") {
      const [n, a] = await Promise.all([
        call("news") as Promise<{ items: NewsRow[] } | null>,
        call("audiences") as Promise<{ items: Audience[] } | null>,
      ]);
      setNews(n?.items ?? []);
      setAudiences(a?.items ?? []);
    }
    if (tab === "audiences" || tab === "kb" || tab === "benefits") {
      const data = (await call("audiences")) as { items: Audience[] } | null;
      setAudiences(data?.items ?? []);
    }
  }, [tab, call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-6">
      <div className="mb-4 flex w-fit rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        {(
          [
            { key: "requests", label: `Заявки${requests.length ? ` · ${requests.length}` : ""}` },
            { key: "news", label: "Новости" },
            { key: "kb", label: "База знаний" },
            { key: "benefits", label: "Бонусы" },
            { key: "audiences", label: "Аудитории" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={
              tab === item.key
                ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
                : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="mb-3 rounded-lg border border-amber-900 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          {message}
        </p>
      ) : null}

      {tab === "requests" ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Заявки на привязку</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Телефон сотрудника не совпал с базой. Укажите, кому принадлежит аккаунт —
              проверка действующего статуса выполнится автоматически.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Telegram</th>
                <th className="px-4 py-3 text-left font-medium">Телефон</th>
                <th className="px-4 py-3 text-left font-medium">Дата</th>
                <th className="px-4 py-3 text-right font-medium">Решение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-600">
                    Заявок нет
                  </td>
                </tr>
              ) : null}
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  busy={busy}
                  onApprove={async (workerId) => {
                    const ok = await call(`link-requests/${request.id}/approve`, {
                      method: "POST",
                      body: JSON.stringify({ workerId }),
                    });
                    if (ok) await load();
                  }}
                  onReject={async () => {
                    const ok = await call(`link-requests/${request.id}/reject`, {
                      method: "POST",
                      body: JSON.stringify({ comment: "отклонено оператором" }),
                    });
                    if (ok) await load();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "news" ? (
        <div className="space-y-4">
          <NewsForm
            audiences={audiences}
            busy={busy}
            onCreate={async (payload) => {
              const created = await call("news", {
                method: "POST",
                body: JSON.stringify(payload),
              });
              if (created) await load();
            }}
          />
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Заголовок</th>
                  <th className="px-4 py-3 text-left font-medium">Аудитория</th>
                  <th className="px-4 py-3 text-right font-medium">Прочтений</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-right font-medium">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {news.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-600">
                      Новостей нет
                    </td>
                  </tr>
                ) : null}
                {news.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 text-zinc-200">{item.title}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {item.audience_name ?? (
                        <span className="text-rose-400">не выбрана</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {item.reads}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          item.is_published
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {item.is_published ? "опубликована" : "черновик"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await call(
                            `news/${item.id}/${item.is_published ? "unpublish" : "publish"}`,
                            { method: "POST" },
                          );
                          if (ok) await load();
                        }}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {item.is_published ? "Снять" : "Опубликовать"}
                      </button>
                      {item.is_published ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            const sent = await call(`news/${item.id}/push`, { method: "POST" });
                            if (sent) setMessage("Уведомление отправлено");
                          }}
                          title="Отправить пуш со ссылкой на эту новость"
                          className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Пуш
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "kb" ? <KbTab call={call} audiences={audiences} busy={busy} /> : null}

      {tab === "benefits" ? (
        <BenefitsTab call={call} audiences={audiences} busy={busy} />
      ) : null}

      {tab === "audiences" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-medium text-white">Аудитории</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Кому виден материал. Внутри правила условия объединяются по И,
              между правилами — по ИЛИ.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const created = await call("audiences", {
                  method: "POST",
                  body: JSON.stringify({ name: "Все сотрудники", isEveryone: true, rules: [] }),
                });
                if (created) await load();
              }}
              className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Создать «Все сотрудники»
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const synced = await call("refs/sync", { method: "POST" });
                if (synced) setMessage("Справочники обновлены из CRM");
              }}
              className="ml-2 mt-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Обновить справочники
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Название</th>
                  <th className="px-4 py-3 text-left font-medium">Охват</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {audiences.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-sm text-zinc-600">
                      Аудиторий нет
                    </td>
                  </tr>
                ) : null}
                {audiences.map((audience) => (
                  <tr key={audience.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 text-zinc-200">{audience.name}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {audience.is_everyone ? "все сотрудники" : "по правилам"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RequestRow({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: LinkRequest;
  busy: boolean;
  onApprove: (workerId: number) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState("");

  return (
    <tr className="hover:bg-zinc-900/40">
      <td className="px-4 py-3 text-zinc-200">
        {request.tg_first_name ?? "—"}
        {request.tg_username ? (
          <span className="ml-1 text-xs text-zinc-500">@{request.tg_username}</span>
        ) : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{request.phone ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-zinc-500">
        {new Date(request.created_at).toLocaleString("ru-RU")}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <input
            value={workerId}
            onChange={(event) => setWorkerId(event.target.value)}
            placeholder="ID сотрудника"
            inputMode="numeric"
            className="w-32 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
          />
          <button
            type="button"
            disabled={busy || !/^\d+$/.test(workerId)}
            onClick={() => void onApprove(Number(workerId))}
            className="rounded-lg border border-emerald-800 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Подтвердить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onReject()}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            Отклонить
          </button>
        </div>
      </td>
    </tr>
  );
}

function NewsForm({
  audiences,
  busy,
  onCreate,
}: {
  audiences: Audience[];
  busy: boolean;
  onCreate: (payload: {
    title: string;
    lead: string;
    bodyMd: string;
    audienceId: number | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [lead, setLead] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [audienceId, setAudienceId] = useState<string>("");

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="text-sm font-medium text-white">Новая новость</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Заголовок"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
        <select
          value={audienceId}
          onChange={(event) => setAudienceId(event.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">Аудитория не выбрана</option>
          {audiences.map((audience) => (
            <option key={audience.id} value={audience.id}>
              {audience.name}
            </option>
          ))}
        </select>
      </div>
      <input
        value={lead}
        onChange={(event) => setLead(event.target.value)}
        placeholder="Краткое описание"
        className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <textarea
        value={bodyMd}
        onChange={(event) => setBodyMd(event.target.value)}
        placeholder="Текст (Markdown)"
        rows={4}
        className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={async () => {
          await onCreate({
            title,
            lead,
            bodyMd,
            audienceId: audienceId ? Number(audienceId) : null,
          });
          setTitle("");
          setLead("");
          setBodyMd("");
        }}
        className="mt-3 rounded-lg border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
      >
        Сохранить черновик
      </button>
      <p className="mt-2 text-xs text-zinc-600">
        Новость создаётся черновиком. Публикация — отдельным действием,
        и без выбранной аудитории она не пройдёт: такую новость никто не увидит.
      </p>
    </div>
  );
}
