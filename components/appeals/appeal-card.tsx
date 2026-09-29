"use client";

import type { Appeal } from "@/lib/appeals";
import type { AppealResolutionMethod } from "@/lib/appeal-intake-sources";
import type { DeliveryPoint } from "@/lib/points";
import {
  appealNeedsManualClassification,
  getAppealCategoryDisplay,
  resolveAppealCategoryKey,
  type SupportCategory,
} from "@/lib/support-classifier";
import { useState } from "react";

import { CategoryBadge, DeletedBadge, StatusBadge } from "./appeal-badges";
import { MessageHistory, OperatorChatReply } from "./appeal-chat";
import { AppealClassificationEditor, AppealEditor } from "./appeal-editor";
import { InlinePointPicker } from "./appeal-fields";
import { AppealMergePanel, MergedContour, MergeHint } from "./appeal-merge";
import { CourierCard } from "./courier-card";
import { toAppealDraft, toCourierDraft, type AppealDraft, type CourierDraft } from "./types";

/** Первая строка описания — то, что курьер написал в поле «Проблема». */
function incidentPreview(issueText: string): string {
  const problemLine = issueText
    .split("\n")
    .find((line) => line.startsWith("Проблема:"))
    ?.replace("Проблема:", "")
    .trim();
  return problemLine || issueText.slice(0, 120);
}

export type AppealCardActions = {
  onToggleExpanded: (id: string) => void;
  onToggleCategory: (key: SupportCategory) => void;
  onExpand: (id: string) => void;
  onAppealDraftChange: (id: string, draft: AppealDraft) => void;
  onCourierDraftChange: (id: string, draft: CourierDraft) => void;
  onResetAppealDraft: (appeal: Appeal) => void;
  onSaveAppeal: (appeal: Appeal) => Promise<string | null>;
  onSaveAppealPoint: (id: string, pointId: string | null) => Promise<boolean>;
  onTakeInProgress: (id: string) => Promise<string | null>;
  onCloseAppeal: (
    id: string,
    input: {
      resultText: string;
      category?: SupportCategory;
      resolutionMethod: AppealResolutionMethod | null;
    },
  ) => Promise<string | null>;
  onReopenAppeal: (id: string) => Promise<string | null>;
  onDeleteAppeal: (id: string) => Promise<string | null>;
  onRestoreAppeal: (id: string) => Promise<string | null>;
  onSendReply: (id: string, text: string) => Promise<void>;
  onSaveClassification: (id: string, category: SupportCategory) => Promise<string | null>;
  onSaveCourier: (appeal: Appeal) => Promise<string | null>;
  onMerge: (primaryId: string, appealIds: string[]) => Promise<string | null>;
  onPendingCategory: (id: string, category: SupportCategory) => void;
};

export type MergeModeProps = {
  enabled: boolean;
  primaryId: string | null;
  selection: Record<string, boolean>;
  secondaryCount: number;
  onSetPrimary: (id: string) => void;
  onToggleSelection: (id: string, checked: boolean) => void;
};

function RestoreBar({
  appeal,
  onRestore,
}: {
  appeal: Appeal;
  onRestore: (id: string) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-t border-zinc-800 bg-rose-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-rose-100/80">
          Обращение в корзине — оно не попадает в списки, отчёты и статистику.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void onRestore(appeal.id)
              .then(setError)
              .finally(() => setBusy(false));
          }}
          className="ml-auto rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-400/60 disabled:opacity-40"
        >
          {busy ? "Восстанавливаем…" : "Восстановить"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

export function AppealCard({
  appeal,
  points,
  expanded,
  appealDraft,
  courierDraft,
  pendingCategory,
  selectedCategories,
  trashView,
  mergeMode,
  actions,
}: {
  appeal: Appeal;
  points: DeliveryPoint[];
  expanded: boolean;
  appealDraft: AppealDraft | undefined;
  courierDraft: CourierDraft | undefined;
  pendingCategory?: SupportCategory;
  selectedCategories: SupportCategory[];
  trashView: boolean;
  mergeMode: MergeModeProps;
  actions: AppealCardActions;
}) {
  const categoryKey = resolveAppealCategoryKey(appeal);
  const needsType = appealNeedsManualClassification(appeal);
  const categoryLabel = getAppealCategoryDisplay(appeal).label;
  const unread = appeal.unreadCount ?? 0;

  return (
    <article
      id={`appeal-${appeal.id}`}
      className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
    >
      <button
        type="button"
        onClick={() => actions.onToggleExpanded(appeal.id)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900 ${
          unread > 0 ? "bg-sky-500/5" : ""
        }`}
      >
        {mergeMode.enabled && !trashView ? (
          <div
            className="flex shrink-0 flex-col items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <label
              className="flex items-center gap-1 text-[10px] text-violet-300"
              title="Главное обращение"
            >
              <input
                type="radio"
                name="merge-primary"
                checked={mergeMode.primaryId === appeal.id}
                onChange={() => mergeMode.onSetPrimary(appeal.id)}
                className="text-violet-500"
              />
              главное
            </label>
            <input
              type="checkbox"
              disabled={mergeMode.primaryId === appeal.id}
              checked={Boolean(mergeMode.selection[appeal.id])}
              onChange={(event) => mergeMode.onToggleSelection(appeal.id, event.target.checked)}
              title="Добавить в объединение"
              className="rounded border-zinc-600 bg-zinc-900 text-violet-500 disabled:opacity-30"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">№{appeal.appealNumber}</span>
            <CategoryBadge
              label={needsType ? "Уточнить тип" : categoryLabel}
              active={selectedCategories.includes(categoryKey)}
              warning={needsType}
              onClick={(event) => {
                event.stopPropagation();
                if (needsType) {
                  actions.onExpand(appeal.id);
                  return;
                }
                actions.onToggleCategory(categoryKey);
              }}
            />
            <StatusBadge appeal={appeal} />
            <DeletedBadge deletedAt={appeal.deletedAt} />
            {unread > 0 ? (
              <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-medium text-white">
                {unread} нов.
              </span>
            ) : null}
            {appeal.mergedAppeals.length > 0 ? (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">
                контур · {appeal.mergedAppeals.length + 1}
              </span>
            ) : null}
            <InlinePointPicker
              appeal={appeal}
              points={points}
              disabled={trashView}
              onSave={(pointId) => actions.onSaveAppealPoint(appeal.id, pointId)}
            />
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500">
            {new Date(appeal.createdAt).toLocaleString("ru-RU")}
            {appeal.courierLastName
              ? ` · ${appeal.courierLastName}`
              : appeal.senderName
                ? ` · ${appeal.senderName}`
                : ""}
            {appeal.phone ? ` · ${appeal.phone}` : ""}
          </div>
          <div className="mt-1 truncate text-sm text-zinc-400">
            {incidentPreview(appeal.issueText)}
          </div>
        </div>
        <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {trashView ? <RestoreBar appeal={appeal} onRestore={actions.onRestoreAppeal} /> : null}

      {expanded ? (
        <div className="border-t border-zinc-800 p-4">
          {/* key: локальное состояние редакторов сбрасывается при смене обращения. */}
          <AppealClassificationEditor
            key={`classification-${appeal.id}`}
            appeal={appeal}
            categoryKey={categoryKey}
            needsManual={needsType}
            disabled={trashView}
            onChange={(category) => actions.onPendingCategory(appeal.id, category)}
            onSave={(category) => actions.onSaveClassification(appeal.id, category)}
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <div>
              <AppealEditor
                key={`editor-${appeal.id}`}
                appeal={appeal}
                points={points}
                draft={appealDraft ?? toAppealDraft(appeal)}
                pendingCategory={pendingCategory}
                readOnly={trashView}
                onChange={(draft) => actions.onAppealDraftChange(appeal.id, draft)}
                onReset={() => actions.onResetAppealDraft(appeal)}
                onSave={() => actions.onSaveAppeal(appeal)}
                onTakeInProgress={() => actions.onTakeInProgress(appeal.id)}
                onClose={(input) => actions.onCloseAppeal(appeal.id, input)}
                onReopen={() => actions.onReopenAppeal(appeal.id)}
                onDelete={() => actions.onDeleteAppeal(appeal.id)}
              />

              {appeal.photoUrl ? (
                <a href={appeal.photoUrl} target="_blank" rel="noreferrer" className="mt-3 block max-w-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={appeal.photoUrl}
                    alt="Фото обращения"
                    className="max-h-80 w-full rounded-lg border border-zinc-800 bg-zinc-900 object-contain"
                  />
                </a>
              ) : null}

              {appeal.photoAnalysis ? (
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                  <span className="text-zinc-500">AI по фото:</span> {appeal.photoAnalysis}
                </div>
              ) : null}

              <MessageHistory appeal={appeal} />
              <OperatorChatReply
                appeal={appeal}
                disabled={trashView}
                onSend={(text) => actions.onSendReply(appeal.id, text)}
              />
              <MergedContour appeals={appeal.mergedAppeals} />

              {!trashView && !mergeMode.enabled ? (
                <AppealMergePanel
                  appeal={appeal}
                  onMerge={(ids) => actions.onMerge(appeal.id, ids)}
                />
              ) : null}

              {!trashView && mergeMode.enabled ? (
                <MergeHint
                  primary={appeal}
                  isPrimary={mergeMode.primaryId === appeal.id}
                  selectedCount={mergeMode.secondaryCount}
                  onSetPrimary={() => mergeMode.onSetPrimary(appeal.id)}
                  onMerge={() =>
                    void actions.onMerge(
                      appeal.id,
                      Object.entries(mergeMode.selection)
                        .filter(([id, checked]) => checked && id !== appeal.id)
                        .map(([id]) => id),
                    )
                  }
                />
              ) : null}
            </div>

            <CourierCard
              appeal={appeal}
              points={points}
              draft={courierDraft ?? toCourierDraft(appeal)}
              readOnly={trashView}
              onChange={(draft) => actions.onCourierDraftChange(appeal.id, draft)}
              onSave={() => actions.onSaveCourier(appeal)}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
