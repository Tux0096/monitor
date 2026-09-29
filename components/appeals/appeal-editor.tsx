"use client";

import { APPEAL_RESOLUTION_METHODS, type AppealResolutionMethod } from "@/lib/appeal-intake-sources";
import type { Appeal } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import {
  SUPPORT_CATEGORY_CATALOG,
  SUPPORT_RESOLUTION_PRESETS,
  type SupportCategory,
} from "@/lib/support-classifier";
import { useState } from "react";

import { isAutoResolved } from "./appeal-badges";
import { PointSelect } from "./appeal-fields";
import { isAppealDraftDirty, type AppealDraft } from "./types";

/**
 * Жизненный цикл обращения. Редактор всегда показывает, на каком шаге
 * обращение сейчас и какое действие ожидается следующим — раньше кнопки
 * «В работе», «Закрыть» и «Сохранить» стояли в ряд без подсказки, что из них
 * основное.
 */
const LIFECYCLE_STEPS = [
  { status: "open", label: "Новое" },
  { status: "in_progress", label: "В работе" },
  { status: "closed", label: "Закрыто" },
] as const;

const NEXT_STEP_HINT: Record<Appeal["status"], string> = {
  open: "Возьмите обращение в работу — курьер увидит, что им занимаются.",
  in_progress: "Опишите решение и закройте обращение.",
  closed: "Обращение закрыто. Решение можно исправить или открыть заново.",
};

function LifecycleRibbon({ appeal }: { appeal: Appeal }) {
  const currentIndex = LIFECYCLE_STEPS.findIndex((step) => step.status === appeal.status);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {LIFECYCLE_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <span key={step.status} className="flex items-center gap-2">
            <span
              className={
                current
                  ? "rounded-full border border-sky-400/50 bg-sky-500/15 px-2 py-0.5 text-sky-100"
                  : done
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200"
                    : "rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-600"
              }
            >
              {step.label}
            </span>
            {index < LIFECYCLE_STEPS.length - 1 ? <span className="text-zinc-700">→</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export function AppealClassificationEditor({
  appeal,
  categoryKey,
  needsManual,
  disabled,
  onChange,
  onSave,
}: {
  appeal: Appeal;
  categoryKey: SupportCategory | "other";
  needsManual: boolean;
  disabled?: boolean;
  onChange?: (category: SupportCategory) => void;
  onSave: (category: SupportCategory) => Promise<string | null>;
}) {
  const [value, setValue] = useState<SupportCategory>(
    categoryKey === "other" ? "other" : categoryKey,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceLabel =
    appeal.classificationSource === "operator"
      ? "Назначено оператором"
      : needsManual
        ? "Тип не определён автоматически"
        : "Определено автоматически";

  async function handleSave() {
    if (value === categoryKey && !needsManual) return;
    setSaving(true);
    setError(null);
    try {
      setError(await onSave(value));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={
        needsManual
          ? "rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
          : "rounded-lg border border-zinc-800 bg-zinc-950 p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Тип обращения</div>
        <span className="text-xs text-zinc-500">{sourceLabel}</span>
      </div>
      {needsManual ? (
        <p className="mt-2 text-xs text-amber-100/90">
          AI не смог надёжно определить тип — выберите категорию вручную.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1 text-xs text-zinc-500">
          Категория
          <select
            value={value}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value as SupportCategory;
              setValue(next);
              onChange?.(next);
            }}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-50"
          >
            {SUPPORT_CATEGORY_CATALOG.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || saving || (value === categoryKey && !needsManual)}
          onClick={() => void handleSave()}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : "Сохранить тип"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

/**
 * Карточка обращения.
 *
 * Юзер-кейсы разведены по явным шагам: правка данных сохраняется отдельной
 * кнопкой, которая активна только при реальных изменениях; одно основное
 * действие соответствует текущему статусу; закрытие требует текста решения и
 * способа (удалённо / выезд); удаление спрятано за подтверждением.
 */
export function AppealEditor({
  appeal,
  points,
  draft,
  pendingCategory,
  readOnly,
  onChange,
  onReset,
  onSave,
  onTakeInProgress,
  onClose,
  onReopen,
  onDelete,
}: {
  appeal: Appeal;
  points: DeliveryPoint[];
  draft: AppealDraft;
  pendingCategory?: SupportCategory;
  readOnly?: boolean;
  onChange: (draft: AppealDraft) => void;
  onReset: () => void;
  onSave: () => Promise<string | null>;
  onTakeInProgress: () => Promise<string | null>;
  onClose: (input: {
    resultText: string;
    category?: SupportCategory;
    resolutionMethod: AppealResolutionMethod | null;
  }) => Promise<string | null>;
  onReopen: () => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<string | null>(null);
  const [customResolution, setCustomResolution] = useState("");
  const [resolutionMethod, setResolutionMethod] = useState<AppealResolutionMethod | null>(
    appeal.resolutionMethod,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "progress" | "close" | "reopen" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = isAppealDraftDirty(appeal, draft);
  const resolutionText = (customResolution.trim() || selectedResolution || "").trim();

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    try {
      const message = await action();
      setError(message);
      return message === null;
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    const ok = await run("save", onSave);
    if (ok) setSavedAt(Date.now());
  }

  async function handleClose() {
    if (!resolutionText) {
      setError("Укажите, как решена проблема");
      return;
    }
    const ok = await run("close", () =>
      onClose({
        resultText: resolutionText,
        category: pendingCategory,
        resolutionMethod,
      }),
    );
    if (ok) {
      setCloseOpen(false);
      setSelectedResolution(null);
      setCustomResolution("");
    }
  }

  async function handleDelete() {
    const ok = await run("delete", onDelete);
    if (ok) setConfirmDelete(false);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Карточка обращения</div>
        <LifecycleRibbon appeal={appeal} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {isAutoResolved(appeal) ? "Закрыто автоответом AI — решение можно исправить." : NEXT_STEP_HINT[appeal.status]}
      </p>

      <div className="mt-3">
        <PointSelect
          label="Точка обращения"
          points={points}
          value={draft.pointId}
          onChange={(pointId) => onChange({ ...draft, pointId })}
        />
      </div>

      <label className="mt-3 block text-xs text-zinc-500">
        Описание / данные обращения
        <textarea
          value={draft.issueText}
          readOnly={readOnly}
          onChange={(event) => onChange({ ...draft, issueText: event.target.value })}
          rows={8}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 read-only:opacity-60"
        />
      </label>

      {appeal.status === "closed" ? (
        <label className="mt-3 block text-xs text-zinc-500">
          Решение
          <textarea
            value={draft.resultText}
            readOnly={readOnly}
            onChange={(event) => onChange({ ...draft, resultText: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 read-only:opacity-60"
          />
          {appeal.resolutionMethod ? (
            <span className="mt-1 block text-[11px] text-zinc-600">
              Способ решения:{" "}
              {APPEAL_RESOLUTION_METHODS.find((item) => item.code === appeal.resolutionMethod)?.label ??
                appeal.resolutionMethod}
            </span>
          ) : null}
        </label>
      ) : null}

      {readOnly ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!dirty || busy !== null}
            onClick={() => void handleSave()}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
          >
            {busy === "save" ? "Сохраняем…" : "Сохранить изменения"}
          </button>
          {dirty ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={onReset}
              className="text-xs text-zinc-500 underline hover:text-zinc-300"
            >
              Отменить правки
            </button>
          ) : savedAt ? (
            <span className="text-xs text-emerald-300">Сохранено</span>
          ) : null}

          <span className="ml-auto flex flex-wrap gap-2">
            {appeal.status === "closed" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("reopen", onReopen)}
                className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-200 disabled:opacity-40"
              >
                {busy === "reopen" ? "Открываем…" : "Открыть снова"}
              </button>
            ) : (
              <>
                {appeal.status === "open" ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run("progress", onTakeInProgress)}
                    className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400 disabled:opacity-40"
                  >
                    {busy === "progress" ? "Берём…" : "Взять в работу"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setCloseOpen((current) => !current)}
                  className={
                    appeal.status === "in_progress"
                      ? "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                      : "rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-200 disabled:opacity-40"
                  }
                >
                  {closeOpen ? "Отмена закрытия" : "Закрыть с решением"}
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}

      {closeOpen && appeal.status !== "closed" && !readOnly ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-sm font-medium text-emerald-100">Чем закончилось обращение</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUPPORT_RESOLUTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setSelectedResolution(preset);
                  setCustomResolution("");
                }}
                className={
                  selectedResolution === preset
                    ? "rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-100"
                    : "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                }
              >
                {preset.length > 48 ? `${preset.slice(0, 48)}…` : preset}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs text-zinc-500">
            Свой текст решения
            <textarea
              value={customResolution}
              onChange={(event) => {
                setCustomResolution(event.target.value);
                setSelectedResolution(null);
              }}
              rows={3}
              placeholder="Опишите, как решена проблема"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>

          <div className="mt-3">
            <span className="text-xs text-zinc-500">Способ решения</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {APPEAL_RESOLUTION_METHODS.map((method) => (
                <button
                  key={method.code}
                  type="button"
                  onClick={() =>
                    setResolutionMethod((current) => (current === method.code ? null : method.code))
                  }
                  className={
                    resolutionMethod === method.code
                      ? "rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-100"
                      : "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                  }
                >
                  {method.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              Попадёт в статистику «Как решали». Можно не указывать.
            </p>
          </div>

          <button
            type="button"
            disabled={!resolutionText || busy !== null}
            onClick={() => void handleClose()}
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy === "close" ? "Закрываем…" : "Закрыть обращение"}
          </button>
        </div>
      ) : null}

      {readOnly ? null : (
        <div className="mt-4 border-t border-zinc-900 pt-3">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <span className="text-xs text-rose-100">
                Удалить обращение №{appeal.appealNumber}? Оно уедет в корзину и пропадёт из отчётов
                и статистики — восстановить можно во вкладке «Корзина».
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleDelete()}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-400 disabled:opacity-40"
                >
                  {busy === "delete" ? "Удаляем…" : "Удалить"}
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-rose-300/80 underline hover:text-rose-200"
            >
              Удалить обращение
            </button>
          )}
        </div>
      )}
    </div>
  );
}
