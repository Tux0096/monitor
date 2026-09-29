"use client";

import {
  AppealCard,
  type AppealCardActions,
} from "@/components/appeals/appeal-card";
import {
  CategoryFilterDropdown,
  DateRangeFilter,
  SummaryCard,
} from "@/components/appeals/appeal-filters";
import { MergeToolbar } from "@/components/appeals/appeal-merge";
import { isAppealInDateRange } from "@/components/appeals/types";
import { useAppeals, type AppealsView } from "@/components/appeals/use-appeals";
import type { Appeal } from "@/lib/appeals";
import type { DeliveryPoint } from "@/lib/points";
import {
  getCategoryLabel,
  resolveAppealCategoryKey,
  type SupportCategory,
} from "@/lib/support-classifier";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StatusFilter = "all" | "open" | "closed";

export function AppealsClient() {
  const searchParams = useSearchParams();
  const courierFilter = searchParams.get("courier");
  const appealNumberParam = searchParams.get("appeal");

  const [view, setView] = useState<AppealsView>("active");
  const appealsApi = useAppeals(view);
  const {
    appeals,
    loading,
    error,
    appealDrafts,
    courierDrafts,
    loadAppeals,
    markRead,
  } = appealsApi;

  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openedFromLink, setOpenedFromLink] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<SupportCategory[]>([]);
  const [pendingCategories, setPendingCategories] = useState<Record<string, SupportCategory>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    searchParams.get("appeal") ? "all" : "open",
  );
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Record<string, boolean>>({});
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const trashView = view === "trash";

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/points", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { points: DeliveryPoint[] };
      setPoints(data.points.filter((point) => point.isActive));
    })();
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current?.contains(event.target as Node)) setCategoryMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!expandedId || trashView) return;
    const appeal = appeals.find((item) => item.id === expandedId);
    if (appeal && (appeal.unreadCount ?? 0) > 0) void markRead(expandedId);
  }, [expandedId, appeals, markRead, trashView]);

  useEffect(() => {
    if (!appealNumberParam || openedFromLink || appeals.length === 0) return;
    const target = appeals.find((item) => String(item.appealNumber) === appealNumberParam);
    if (!target) return;
    setOpenedFromLink(true);
    setExpandedId(target.id);
    void markRead(target.id);
    requestAnimationFrame(() => {
      document
        .getElementById(`appeal-${target.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [appealNumberParam, appeals, openedFromLink, markRead]);

  const toggleCategory = useCallback((key: SupportCategory) => {
    setSelectedCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }, []);

  const exitMergeMode = useCallback(() => {
    setMergeMode(false);
    setMergeSelection({});
    setMergePrimaryId(null);
    setMergeError(null);
  }, []);

  const setMergePrimary = useCallback((id: string) => {
    setMergePrimaryId(id);
    setMergeSelection((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setMergeError(null);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appeal of appeals) {
      const key = resolveAppealCategoryKey(appeal);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [appeals]);

  const baseFilteredAppeals = useMemo(() => {
    const query = search.trim().toLowerCase();

    return appeals.filter((appeal) => {
      if (courierFilter && appeal.maxUserId !== courierFilter) return false;
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(resolveAppealCategoryKey(appeal))
      ) {
        return false;
      }
      if (!isAppealInDateRange(appeal.createdAt, dateFrom, dateTo)) return false;
      if (!query) return true;

      const haystack = [
        String(appeal.appealNumber),
        appeal.courierLastName,
        appeal.senderName,
        appeal.phone,
        appeal.issueText,
        appeal.category,
        getCategoryLabel(appeal.classification),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [appeals, courierFilter, search, selectedCategories, dateFrom, dateTo]);

  const visibleAppeals = useMemo(
    () =>
      baseFilteredAppeals.filter((appeal) => {
        if (statusFilter === "open") return appeal.status !== "closed";
        if (statusFilter === "closed") return appeal.status === "closed";
        return true;
      }),
    [baseFilteredAppeals, statusFilter],
  );

  const openCount = baseFilteredAppeals.filter((a) => a.status !== "closed").length;
  const closedCount = baseFilteredAppeals.filter((a) => a.status === "closed").length;
  const unreadTotal = baseFilteredAppeals.reduce((sum, a) => sum + (a.unreadCount ?? 0), 0);

  const mergeSecondaryCount = Object.entries(mergeSelection).filter(
    ([id, checked]) => checked && id !== mergePrimaryId,
  ).length;
  const mergePrimary: Appeal | null = mergePrimaryId
    ? (appeals.find((appeal) => appeal.id === mergePrimaryId) ?? null)
    : null;

  const runMerge = useCallback(
    async (primaryId: string, appealIds: string[]) => {
      const ids = appealIds.filter((id) => id !== primaryId);
      if (ids.length === 0) {
        const message = "Отметьте хотя бы одно обращение для объединения";
        setMergeError(message);
        return message;
      }
      const result = await appealsApi.mergeAppeals(primaryId, ids);
      setMergeError(result);
      if (!result) exitMergeMode();
      return result;
    },
    [appealsApi, exitMergeMode],
  );

  const actions: AppealCardActions = useMemo(
    () => ({
      onToggleExpanded: (id) =>
        setExpandedId((current) => {
          const next = current === id ? null : id;
          if (next && !trashView) void markRead(next);
          return next;
        }),
      onExpand: (id) => setExpandedId(id),
      onToggleCategory: toggleCategory,
      onAppealDraftChange: appealsApi.setAppealDraft,
      onCourierDraftChange: appealsApi.setCourierDraft,
      onResetAppealDraft: appealsApi.resetAppealDraft,
      onSaveAppeal: appealsApi.saveAppeal,
      onSaveAppealPoint: appealsApi.saveAppealPoint,
      onTakeInProgress: appealsApi.takeInProgress,
      onCloseAppeal: appealsApi.closeAppeal,
      onReopenAppeal: appealsApi.reopenAppeal,
      onDeleteAppeal: appealsApi.deleteAppeal,
      onRestoreAppeal: appealsApi.restoreAppeal,
      onSendReply: appealsApi.sendOperatorReply,
      onSaveClassification: appealsApi.saveClassification,
      onSaveCourier: appealsApi.saveCourier,
      onMerge: runMerge,
      onPendingCategory: (id, category) =>
        setPendingCategories((current) => ({ ...current, [id]: category })),
    }),
    [appealsApi, markRead, runMerge, toggleCategory, trashView],
  );

  return (
    <main className={`mx-auto max-w-7xl px-4 py-8 ${mergeMode ? "pb-28" : ""}`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-600">Курьерское приложение · MAX</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Обращения</h1>
          {unreadTotal > 0 && !trashView ? (
            <p className="mt-2 text-sm text-sky-300">
              {unreadTotal} нов{unreadTotal === 1 ? "ое" : "ых"} сообщени
              {unreadTotal === 1 ? "е" : unreadTotal < 5 ? "я" : "й"} от курьеров
            </p>
          ) : null}
          {courierFilter ? (
            <p className="mt-2 text-xs text-zinc-500">
              Фильтр по курьеру: {courierFilter}
              {" · "}
              <Link href="/dashboard/appeals" className="text-sky-400 hover:text-sky-300">
                сбросить
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {trashView ? null : (
            <button
              type="button"
              onClick={() => {
                if (mergeMode) {
                  exitMergeMode();
                } else {
                  setMergeMode(true);
                  setMergeSelection({});
                  setMergePrimaryId(null);
                  setMergeError(null);
                }
              }}
              className={
                mergeMode
                  ? "rounded-lg border border-violet-400/50 bg-violet-500/10 px-4 py-2 text-sm text-violet-100"
                  : "rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
              }
            >
              {mergeMode ? "Отменить объединение" : "Объединить обращения"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadAppeals()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Обновить
          </button>
        </div>
      </div>

      <div className="mb-4 flex w-fit rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        <button
          type="button"
          onClick={() => {
            setView("active");
            setExpandedId(null);
          }}
          className={
            view === "active"
              ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
              : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          }
        >
          Обращения
        </button>
        <button
          type="button"
          onClick={() => {
            setView("trash");
            setExpandedId(null);
            exitMergeMode();
          }}
          className={
            view === "trash"
              ? "rounded-lg bg-zinc-700/60 px-4 py-2 text-sm text-white"
              : "rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          }
        >
          Корзина
        </button>
      </div>

      {trashView ? null : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            label="В работе и новые"
            value={openCount}
            active={statusFilter === "open"}
            onClick={() => setStatusFilter("open")}
          />
          <SummaryCard
            label="Закрытые"
            value={closedCount}
            active={statusFilter === "closed"}
            onClick={() => setStatusFilter("closed")}
          />
          <SummaryCard
            label="Всего в выборке"
            value={baseFilteredAppeals.length}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: № обращения, курьер, телефон, текст"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
          />
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClear={() => {
              setDateFrom("");
              setDateTo("");
            }}
          />
          <CategoryFilterDropdown
            ref={categoryMenuRef}
            open={categoryMenuOpen}
            onToggle={() => setCategoryMenuOpen((value) => !value)}
            selected={selectedCategories}
            counts={categoryCounts}
            onToggleCategory={toggleCategory}
            onClear={() => setSelectedCategories([])}
          />
        </div>
      </section>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        {loading ? (
          <div className="text-sm text-zinc-500">Загружаем обращения…</div>
        ) : visibleAppeals.length === 0 ? (
          <div className="text-sm text-zinc-500">
            {trashView ? "Корзина пуста." : "Обращений по фильтрам не найдено."}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAppeals.map((appeal) => (
              <AppealCard
                key={appeal.id}
                appeal={appeal}
                points={points}
                expanded={expandedId === appeal.id}
                appealDraft={appealDrafts[appeal.id]}
                courierDraft={courierDrafts[appeal.id]}
                pendingCategory={pendingCategories[appeal.id]}
                selectedCategories={selectedCategories}
                trashView={trashView}
                mergeMode={{
                  enabled: mergeMode,
                  primaryId: mergePrimaryId,
                  selection: mergeSelection,
                  secondaryCount: mergeSecondaryCount,
                  onSetPrimary: setMergePrimary,
                  onToggleSelection: (id, checked) => {
                    setMergeSelection((current) => ({ ...current, [id]: checked }));
                    setMergeError(null);
                  },
                }}
                actions={actions}
              />
            ))}
          </div>
        )}
      </section>

      {mergeMode && !trashView ? (
        <MergeToolbar
          primary={mergePrimary}
          secondaryCount={mergeSecondaryCount}
          error={mergeError}
          onCancel={exitMergeMode}
          onMerge={() => {
            if (!mergePrimary) {
              setMergeError("Выберите главное обращение (радиокнопка)");
              return;
            }
            void runMerge(
              mergePrimary.id,
              Object.entries(mergeSelection)
                .filter(([, checked]) => checked)
                .map(([id]) => id),
            );
          }}
        />
      ) : null}
    </main>
  );
}
