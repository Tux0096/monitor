"use client";

import type { Appeal } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import Link from "next/link";
import { useState } from "react";

import { Field, PointSelect } from "./appeal-fields";
import type { CourierDraft } from "./types";

export function CourierCard({
  appeal,
  points,
  draft,
  readOnly,
  onChange,
  onSave,
}: {
  appeal: Appeal;
  points: DeliveryPoint[];
  draft: CourierDraft;
  readOnly?: boolean;
  onChange: (draft: CourierDraft) => void;
  onSave: () => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      setError(await onSave());
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Карточка курьера</div>
        {appeal.maxUserId ? (
          <Link
            href={`/dashboard/employees?search=${encodeURIComponent(
              draft.lastName || draft.phone || appeal.maxUserId,
            )}`}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            В базе
          </Link>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
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
        <Field label="ОС" value={draft.os ?? ""} onChange={(os) => onChange({ ...draft, os })} />
        <Field
          label="Версия приложения"
          value={draft.appVersion ?? ""}
          onChange={(appVersion) => onChange({ ...draft, appVersion })}
        />
        <PointSelect
          label="Точка курьера"
          points={points}
          value={draft.pointId}
          onChange={(pointId) => onChange({ ...draft, pointId })}
        />
        <Field
          label="Теги"
          value={draft.tagsText}
          onChange={(tagsText) => onChange({ ...draft, tagsText })}
        />
        <label className="text-xs text-zinc-500">
          Пометки
          <textarea
            value={draft.notes ?? ""}
            onChange={(event) => onChange({ ...draft, notes: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
          />
        </label>
      </div>
      <div className="mt-3 text-xs text-zinc-500">
        Обращений: {appeal.courierProfile?.totalAppeals ?? 0}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      {readOnly ? null : (
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : "Сохранить карточку"}
        </button>
      )}
    </aside>
  );
}
