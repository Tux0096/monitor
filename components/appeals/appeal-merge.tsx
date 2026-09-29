"use client";

import type { Appeal, MergeCandidate } from "@/lib/appeals";
import { useState } from "react";

export function MergedContour({ appeals }: { appeals: Appeal[] }) {
  if (appeals.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-violet-300">Единый контур</div>
      <div className="space-y-2">
        {appeals.map((appeal) => (
          <div
            key={appeal.id}
            className="rounded-lg border border-violet-500/10 bg-zinc-950/80 p-3 text-sm"
          >
            <div className="font-medium text-zinc-200">
              №{appeal.appealNumber} · {new Date(appeal.createdAt).toLocaleString("ru-RU")}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{appeal.issueText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Панель «подтянуть дубли этого же курьера» внутри раскрытой карточки. */
export function AppealMergePanel({
  appeal,
  onMerge,
}: {
  appeal: Appeal;
  onMerge: (appealIds: string[]) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const hasContour = appeal.mergedAppeals.length > 0;

  async function loadCandidates() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/appeals/${appeal.id}/merge-candidates`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setError("Не удалось загрузить список обращений");
        return;
      }
      const data = (await response.json()) as { candidates: MergeCandidate[] };
      setCandidates(data.candidates);
      setSelectedIds({});
    } finally {
      setLoading(false);
    }
  }

  async function runMerge(ids: string[]) {
    if (ids.length === 0) {
      setError("Выберите обращения для объединения");
      return;
    }
    setMerging(true);
    setError(null);
    try {
      const message = await onMerge(ids);
      if (message) {
        setError(message);
        return;
      }
      setOpen(false);
      setSelectedIds({});
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          void loadCandidates();
        }}
        className={
          open
            ? "rounded-lg border border-violet-400/50 bg-violet-500/15 px-4 py-2 text-sm text-violet-100"
            : "rounded-lg border border-violet-500/40 px-4 py-2 text-sm text-violet-200 hover:border-violet-400/60"
        }
      >
        {open ? "Скрыть объединение" : "Объединить обращения"}
        {hasContour ? ` · контур ${appeal.mergedAppeals.length + 1}` : ""}
      </button>

      {open ? (
        <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-violet-100">
              Дубли курьера к №{appeal.appealNumber}
            </div>
            {candidates.length > 0 ? (
              <button
                type="button"
                disabled={merging}
                onClick={() => void runMerge(candidates.map((item) => item.id))}
                className="text-xs text-violet-200 underline hover:text-white disabled:opacity-40"
              >
                Объединить все ({candidates.length})
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-violet-100/80">
            Выберите другие обращения этого курьера — история и сообщения перейдут в текущую
            карточку. Курьер получит уведомление в MAX.
          </p>
          {loading ? (
            <p className="mt-3 text-xs text-violet-200/70">Загружаем список…</p>
          ) : candidates.length === 0 ? (
            <p className="mt-3 text-xs text-violet-200/70">
              Других обращений этого курьера для объединения нет.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-violet-500/20 bg-zinc-950/60 px-3 py-2 hover:border-violet-400/30">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIds[candidate.id])}
                      onChange={(event) =>
                        setSelectedIds((current) => ({
                          ...current,
                          [candidate.id]: event.target.checked,
                        }))
                      }
                      className="mt-1 rounded border-zinc-600 bg-zinc-900 text-violet-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-violet-50">
                        №{candidate.appealNumber}
                      </span>
                      <span className="ml-2 text-xs text-violet-200/70">
                        {new Date(candidate.createdAt).toLocaleString("ru-RU")}
                        {candidate.status === "closed" ? " · закрыто" : ""}
                        {candidate.status === "in_progress" ? " · в работе" : ""}
                      </span>
                      <span className="mt-1 block text-xs text-violet-100/80">
                        {candidate.issuePreview}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
          {candidates.length > 0 ? (
            <button
              type="button"
              disabled={merging || selectedCount === 0}
              onClick={() =>
                void runMerge(
                  Object.entries(selectedIds)
                    .filter(([, checked]) => checked)
                    .map(([id]) => id),
                )
              }
              className="mt-3 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
            >
              {merging ? "Объединяем…" : `Объединить выбранные (${selectedCount})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Нижняя панель режима массового объединения по списку. */
export function MergeToolbar({
  primary,
  secondaryCount,
  error,
  onCancel,
  onMerge,
}: {
  primary: Appeal | null;
  secondaryCount: number;
  error: string | null;
  onCancel: () => void;
  onMerge: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-violet-500/30 bg-zinc-950/95 px-4 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-violet-100">Объединение обращений</div>
          <p className="mt-1 text-xs text-violet-100/80">
            {primary
              ? `Главное: №${primary.appealNumber} · к объединению: ${secondaryCount}`
              : "Выберите главное обращение радиокнопкой, дубли — чекбоксами"}
          </p>
          {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!primary || secondaryCount === 0}
            onClick={onMerge}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
          >
            Объединить ({secondaryCount})
          </button>
        </div>
      </div>
    </div>
  );
}

/** Подсказка внутри карточки, когда включён режим массового объединения. */
export function MergeHint({
  primary,
  isPrimary,
  selectedCount,
  onSetPrimary,
  onMerge,
}: {
  primary: Appeal;
  isPrimary: boolean;
  selectedCount: number;
  onSetPrimary: () => void;
  onMerge: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
      <div className="text-sm font-medium text-violet-100">Объединение в контур</div>
      <p className="mt-2 text-xs text-violet-100/80">
        Отметьте дубли чекбоксами в списке. Главное обращение — радиокнопка; в него перейдут история
        и сообщения, вторичные будут закрыты.
      </p>
      {!isPrimary ? (
        <button
          type="button"
          onClick={onSetPrimary}
          className="mt-3 rounded-lg border border-violet-400/40 px-3 py-2 text-sm text-violet-100"
        >
          Сделать №{primary.appealNumber} главным
        </button>
      ) : (
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onMerge}
          className="mt-3 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
        >
          Объединить выбранные ({selectedCount})
        </button>
      )}
    </div>
  );
}
