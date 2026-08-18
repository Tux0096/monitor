import { auth } from "@/auth";
import { readCabinetOverview } from "@/lib/cabinet-service-client";

import { CabinetAdmin } from "./cabinet-admin";

export const dynamic = "force-dynamic";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] ${
        ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {label}
    </span>
  );
}

export default async function CabinetPage() {
  const session = await auth();
  if (!session?.user) {
    return <div className="p-8 text-sm text-zinc-500">Нужна авторизация.</div>;
  }

  const overview = await readCabinetOverview();

  const cards = [
    { label: "Сотрудников привязано", value: overview.users },
    { label: "Активных сессий", value: overview.activeSessions },
    { label: "Заявок на привязку", value: overview.pendingLinkRequests },
  ];

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-zinc-600">Telegram Mini App</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Личный кабинет</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-500">
          Кабинет сотрудника: карточка из CRM, база знаний, новости и бонусы.
          Данные CRM читаются только на просмотр — кабинет в неё ничего не пишет.
        </p>
      </div>

      {!overview.available ? (
        <div className="mb-6 rounded-2xl border border-rose-900 bg-rose-500/5 p-4">
          <div className="text-sm text-rose-300">{overview.error}</div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">
            {`cd /opt/monitor\ndocker compose up -d --build cabinet-service\ndocker compose logs --tail 30 cabinet-service`}
          </pre>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">Сервис</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Состояние</dt>
              <dd>
                <StatusPill
                  ok={overview.available}
                  label={overview.available ? "работает" : "недоступен"}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Источник данных CRM</dt>
              <dd className="text-zinc-200">
                {overview.health?.crmSource === "postgres" ? (
                  <span className="font-mono text-xs">postgres · боевая fuji_new</span>
                ) : (
                  <span className="font-mono text-xs">seed · фикстуры</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Версия</dt>
              <dd className="font-mono text-xs text-zinc-400">
                {overview.health?.version ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-medium text-white">Контракт схемы CRM</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Сверка таблиц и колонок при старте. Нехватка колонки останавливает
            сервис: молча отдавать пустые права нельзя — это тихая потеря
            доступа у всех сотрудников сразу.
          </p>
          {overview.crm ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">Результат</span>
                <StatusPill
                  ok={overview.crm.ok}
                  label={overview.crm.ok ? "схема совпадает" : "есть расхождения"}
                />
              </div>
              {overview.crm.missing.length > 0 ? (
                <div className="rounded-lg border border-rose-900 bg-rose-500/5 p-3">
                  <div className="text-xs text-rose-300">Отсутствует:</div>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-rose-200">
                    {overview.crm.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {overview.crm.error ? (
                <p className="text-xs text-rose-300">{overview.crm.error}</p>
              ) : null}
              <p className="text-[11px] text-zinc-600">
                Проверено: {new Date(overview.crm.checkedAt).toLocaleString("ru-RU")}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">Проверка недоступна.</p>
          )}
        </div>
      </section>

      {overview.available ? <CabinetAdmin /> : null}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-sm font-medium text-white">Готовность</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
          <li>✓ Вход по подписи Telegram, сессии с ротацией refresh</li>
          <li>✓ Карточка сотрудника из CRM, доступы, матценности, смены</li>
          <li>✓ Привязка по номеру телефона и заявки администратору</li>
          <li>✓ Новости, база знаний с поиском, бонусы с пулом промокодов</li>
          <li>✓ Аудитории, публикация новостей, журнал действий</li>
          <li className="text-zinc-600">— Фото сотрудников и пуш о новостях</li>
          <li className="text-zinc-600">— Редактор базы знаний и загрузка пула кодов</li>
        </ul>
      </section>
    </main>
  );
}
