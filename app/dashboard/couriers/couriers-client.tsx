"use client";

import type { CourierProfile } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type CouriersResponse = {
  couriers: CourierProfile[];
};

type CourierDraft = Pick<
  CourierProfile,
  "displayName" | "lastName" | "phone" | "phoneModel" | "os" | "appVersion" | "notes"
> & {
  tagsText: string;
  pointId: string;
};

export function CouriersClient() {
  const searchParams = useSearchParams();
  const [couriers, setCouriers] = useState<CourierProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CourierDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [points, setPoints] = useState<DeliveryPoint[]>([]);

  useEffect(() => {
    const initial = searchParams.get("search") ?? "";
    setSearch(initial);
    void loadCouriers(initial);
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/points", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { points: DeliveryPoint[] };
      setPoints(data.points.filter((point) => point.isActive));
    })();
  }, []);

  async function loadCouriers(query = search) {
    setLoading(true);
    try {
      const params = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
      const response = await fetch(`/api/couriers${params}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as CouriersResponse;
      setCouriers(data.couriers);
      setDrafts((current) => {
        const next = { ...current };
        for (const courier of data.couriers) {
          next[courier.id] ??= toDraft(courier);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  async function saveCourier(courier: CourierProfile) {
    const draft = drafts[courier.id];
    if (!draft) return;
    setSavingId(courier.id);
    try {
      const response = await fetch(`/api/couriers/${courier.id}`, {
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
          tags: draft.tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          pointId: draft.pointId || null,
        }),
      });
      if (response.ok) await loadCouriers();
    } finally {
      setSavingId(null);
    }
  }

  const totalAppeals = couriers.reduce((sum, courier) => sum + courier.totalAppeals, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">MAX · база курьеров</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">База курьеров</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadCouriers()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Обновить
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard label="Курьеров в базе" value={couriers.length} />
        <SummaryCard label="Всего обращений" value={totalAppeals} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void loadCouriers(search);
          }}
          placeholder="Поиск: фамилия, телефон, MAX ID"
          className="min-w-[260px] flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
        <button
          type="button"
          onClick={() => void loadCouriers(search)}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Найти
        </button>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        {loading ? (
          <div className="text-sm text-zinc-500">Загружаем курьеров…</div>
        ) : couriers.length === 0 ? (
          <div className="text-sm text-zinc-500">
            Курьеры появятся после первых обращений в MAX.
          </div>
        ) : (
          <div className="space-y-2">
            {couriers.map((courier) => {
              const draft = drafts[courier.id] ?? toDraft(courier);
              const expanded = expandedId === courier.id;
              const displayName = draft.lastName || draft.displayName || "Без имени";

              return (
                <article
                  key={courier.id}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : courier.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-white">{displayName}</span>
                        {draft.phone ? (
                          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300">
                            {draft.phone}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          {courier.totalAppeals} обращ.
                        </span>
                        {courier.pointName ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
                            {courier.pointName}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {draft.phoneModel || draft.os || draft.appVersion
                          ? [draft.phoneModel, draft.os, draft.appVersion ? `v${draft.appVersion}` : ""]
                              .filter(Boolean)
                              .join(" · ")
                          : `MAX ID: ${courier.maxUserId}`}
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-600">
                        {courier.lastAppealAt
                          ? `Последнее обращение: ${new Date(courier.lastAppealAt).toLocaleString("ru-RU")}`
                          : `MAX ID: ${courier.maxUserId}`}
                      </div>
                    </div>
                    <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-zinc-800 p-4">
                      <CourierFullCard
                        courier={courier}
                        points={points}
                        draft={draft}
                        saving={savingId === courier.id}
                        onChange={(next) =>
                          setDrafts((current) => ({ ...current, [courier.id]: next }))
                        }
                        onSave={() => void saveCourier(courier)}
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

function CourierFullCard({
  courier,
  points,
  draft,
  saving,
  onChange,
  onSave,
}: {
  courier: CourierProfile;
  points: DeliveryPoint[];
  draft: CourierDraft;
  saving: boolean;
  onChange: (draft: CourierDraft) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="mb-3 text-sm font-medium text-white">Карточка курьера</div>
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
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить карточку"}
          </button>
          <Link
            href={`/dashboard/appeals?courier=${encodeURIComponent(courier.maxUserId)}`}
            className="rounded-lg border border-sky-500/30 px-4 py-2 text-sm text-sky-300 hover:border-sky-400/50"
          >
            Обращения курьера
          </Link>
        </div>
      </div>

      <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Сводка</div>
        <dl className="mt-3 space-y-3 text-sm">
          <InfoRow label="MAX ID" value={courier.maxUserId} />
          <InfoRow label="Точка" value={courier.pointName ?? "—"} />
          <InfoRow label="Обращений" value={String(courier.totalAppeals)} />
          <InfoRow
            label="Последнее обращение"
            value={
              courier.lastAppealAt
                ? new Date(courier.lastAppealAt).toLocaleString("ru-RU")
                : "—"
            }
          />
          <InfoRow
            label="Обновлено"
            value={new Date(courier.updatedAt).toLocaleString("ru-RU")}
          />
          {courier.tags.length > 0 ? (
            <div>
              <dt className="text-xs text-zinc-500">Теги</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {courier.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200">{value}</dd>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
      />
    </label>
  );
}

function toDraft(courier: CourierProfile): CourierDraft {
  return {
    displayName: courier.displayName ?? "",
    lastName: courier.lastName ?? "",
    phone: courier.phone ?? "",
    phoneModel: courier.phoneModel ?? "",
    os: courier.os ?? "",
    appVersion: courier.appVersion ?? "",
    notes: courier.notes ?? "",
    tagsText: courier.tags.join(", "),
    pointId: courier.pointId ?? "",
  };
}
