"use client";

import type { EmployeeProfile } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type EmployeesResponse = {
  employees: EmployeeProfile[];
};

type EmployeeDraft = Pick<
  EmployeeProfile,
  | "displayName"
  | "lastName"
  | "phone"
  | "phoneModel"
  | "os"
  | "appVersion"
  | "notes"
  | "isAdmin"
  | "telegramAccount"
  | "maxAccount"
> & {
  tagsText: string;
  pointId: string;
};

export function EmployeesClient() {
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [points, setPoints] = useState<DeliveryPoint[]>([]);

  useEffect(() => {
    const initial = searchParams.get("search") ?? "";
    setSearch(initial);
    void loadEmployees(initial);
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/points", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { points: DeliveryPoint[] };
      setPoints(data.points.filter((point) => point.isActive));
    })();
  }, []);

  async function loadEmployees(query = search) {
    setLoading(true);
    try {
      const params = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
      const response = await fetch(`/api/employees${params}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as EmployeesResponse;
      setEmployees(data.employees);
      setDrafts((current) => {
        const next = { ...current };
        for (const employee of data.employees) {
          next[employee.id] ??= toDraft(employee);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  async function saveEmployee(employee: EmployeeProfile) {
    const draft = drafts[employee.id];
    if (!draft) return;
    setSavingId(employee.id);
    try {
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName,
          lastName: draft.lastName,
          phone: draft.phone,
          phoneModel: draft.phoneModel,
          os: draft.os,
          appVersion: draft.appVersion,
          notes: draft.notes,
          isAdmin: draft.isAdmin,
          telegramAccount: draft.telegramAccount,
          maxAccount: draft.maxAccount,
          tags: draft.tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          pointId: draft.pointId || null,
        }),
      });
      if (response.ok) await loadEmployees();
    } finally {
      setSavingId(null);
    }
  }

  const totalAppeals = employees.reduce((sum, employee) => sum + employee.totalAppeals, 0);
  const adminCount = employees.filter((employee) => employee.isAdmin).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Поддержка · база сотрудников</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">База сотрудников</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadEmployees()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Обновить
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Сотрудников в базе" value={employees.length} />
        <SummaryCard label="Администраторов" value={adminCount} />
        <SummaryCard label="Всего обращений" value={totalAppeals} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void loadEmployees(search);
          }}
          placeholder="Поиск: фамилия, телефон, TG/MAX аккаунт"
          className="min-w-[260px] flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
        <button
          type="button"
          onClick={() => void loadEmployees(search)}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Найти
        </button>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        {loading ? (
          <div className="text-sm text-zinc-500">Загружаем сотрудников…</div>
        ) : employees.length === 0 ? (
          <div className="text-sm text-zinc-500">
            Сотрудники появятся после первых сообщений в Telegram или MAX.
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map((employee) => {
              const draft = drafts[employee.id] ?? toDraft(employee);
              const expanded = expandedId === employee.id;
              const displayName = draft.lastName || draft.displayName || "Без имени";

              return (
                <article
                  key={employee.id}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : employee.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-white">{displayName}</span>
                        {employee.isAdmin ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                            Администратор
                          </span>
                        ) : (
                          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-400">
                            Пользователь
                          </span>
                        )}
                        {draft.phone ? (
                          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
                            {draft.phone}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          {employee.totalAppeals} обращ.
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {employee.telegramAccount || employee.maxAccount || `ID: ${employee.maxUserId}`}
                      </div>
                    </div>
                    <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-zinc-800 p-4">
                      <EmployeeFullCard
                        employee={employee}
                        points={points}
                        draft={draft}
                        saving={savingId === employee.id}
                        onChange={(next) =>
                          setDrafts((current) => ({ ...current, [employee.id]: next }))
                        }
                        onSave={() => void saveEmployee(employee)}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function EmployeeFullCard({
  employee,
  points,
  draft,
  saving,
  onChange,
  onSave,
}: {
  employee: EmployeeProfile;
  points: DeliveryPoint[];
  draft: EmployeeDraft;
  saving: boolean;
  onChange: (draft: EmployeeDraft) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="mb-3 text-sm font-medium text-white">Карточка сотрудника</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Имя"
            value={draft.displayName ?? ""}
            onChange={(displayName) => onChange({ ...draft, displayName })}
          />
          <Field
            label="Фамилия"
            value={draft.lastName ?? ""}
            onChange={(lastName) => onChange({ ...draft, lastName })}
          />
          <Field
            label="Телефон"
            value={draft.phone ?? ""}
            onChange={(phone) => onChange({ ...draft, phone })}
          />
          <label className="text-xs text-zinc-500">
            Администратор
            <select
              value={draft.isAdmin ? "yes" : "no"}
              onChange={(event) => onChange({ ...draft, isAdmin: event.target.value === "yes" })}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            >
              <option value="no">Нет</option>
              <option value="yes">Да</option>
            </select>
          </label>
          <Field
            label="Telegram аккаунт"
            value={draft.telegramAccount ?? ""}
            onChange={(telegramAccount) => onChange({ ...draft, telegramAccount })}
            placeholder="https://t.me/username или @username"
          />
          <Field
            label="MAX аккаунт"
            value={draft.maxAccount ?? ""}
            onChange={(maxAccount) => onChange({ ...draft, maxAccount })}
            placeholder="ID или ссылка на профиль MAX"
          />
          <Field
            label="Модель телефона"
            value={draft.phoneModel ?? ""}
            onChange={(phoneModel) => onChange({ ...draft, phoneModel })}
          />
          <Field
            label="ОС"
            value={draft.os ?? ""}
            onChange={(os) => onChange({ ...draft, os })}
          />
          <Field
            label="Версия приложения"
            value={draft.appVersion ?? ""}
            onChange={(appVersion) => onChange({ ...draft, appVersion })}
          />
          <label className="text-xs text-zinc-500">
            Точка
            <select
              value={draft.pointId}
              onChange={(event) => onChange({ ...draft, pointId: event.target.value })}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            >
              <option value="">Не выбрана</option>
              {points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.city ? `${point.name} · ${point.city}` : point.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Теги"
            value={draft.tagsText}
            onChange={(tagsText) => onChange({ ...draft, tagsText })}
          />
          <label className="text-xs text-zinc-500 md:col-span-2">
            Пометки
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) => onChange({ ...draft, notes: event.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
            />
          </label>
        </div>
        {draft.isAdmin ? (
          <p className="mt-3 text-xs text-amber-200/80">
            Сообщения администратора в чатах поддержки не создают обращения.
          </p>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Аккаунты Telegram и MAX присваиваются автоматически при первом сообщении.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить карточку"}
          </button>
          {!employee.isAdmin ? (
            <Link
              href={`/dashboard/appeals?courier=${encodeURIComponent(employee.maxUserId)}`}
              className="rounded-lg border border-sky-500/30 px-4 py-2 text-sm text-sky-300 hover:border-sky-400/50"
            >
              Обращения сотрудника
            </Link>
          ) : null}
        </div>
      </div>

      <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Сводка</div>
        <dl className="mt-3 space-y-3 text-sm">
          <InfoRow label="Внутренний ID" value={employee.maxUserId} />
          <InfoRow label="Telegram" value={employee.telegramAccount ?? "—"} />
          <InfoRow label="MAX" value={employee.maxAccount ?? "—"} />
          <InfoRow label="Роль" value={employee.isAdmin ? "Администратор" : "Пользователь"} />
          <InfoRow label="Точка" value={employee.pointName ?? "—"} />
          <InfoRow label="Обращений" value={String(employee.totalAppeals)} />
          <InfoRow
            label="Последнее обращение"
            value={
              employee.lastAppealAt
                ? new Date(employee.lastAppealAt).toLocaleString("ru-RU")
                : "—"
            }
          />
          <InfoRow
            label="Обновлено"
            value={new Date(employee.updatedAt).toLocaleString("ru-RU")}
          />
        </dl>
      </aside>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-all text-zinc-200">{value}</dd>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
      />
    </label>
  );
}

function toDraft(employee: EmployeeProfile): EmployeeDraft {
  return {
    displayName: employee.displayName ?? "",
    lastName: employee.lastName ?? "",
    phone: employee.phone ?? "",
    phoneModel: employee.phoneModel ?? "",
    os: employee.os ?? "",
    appVersion: employee.appVersion ?? "",
    notes: employee.notes ?? "",
    isAdmin: employee.isAdmin,
    telegramAccount: employee.telegramAccount ?? "",
    maxAccount: employee.maxAccount ?? "",
    tagsText: employee.tags.join(", "),
    pointId: employee.pointId ?? "",
  };
}
