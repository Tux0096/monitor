"use client";

import type { Appeal, CourierProfile } from "@/lib/appeals";
import {
  appealNeedsManualClassification,
  getCategoryLabel,
  resolveAppealCategoryKey,
  SUPPORT_CATEGORY_CATALOG,
  type SupportCategory,
} from "@/lib/support-classifier";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

type AppealsResponse = {
  appeals: Appeal[];
};

type CourierDraft = Pick<
  CourierProfile,
  "displayName" | "lastName" | "phone" | "phoneModel" | "os" | "appVersion" | "notes"
> & {
  tagsText: string;
};

type AppealDraft = {
  issueText: string;
  resultText: string;
  operatorReply: string;
};

export function AppealsClient() {
  const searchParams = useSearchParams();
  const courierFilter = searchParams.get("courier");
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [courierDrafts, setCourierDrafts] = useState<Record<string, CourierDraft>>({});
  const [appealDrafts, setAppealDrafts] = useState<Record<string, AppealDraft>>({});
  const [mergeSelection, setMergeSelection] = useState<Record<string, boolean>>({});
  const [mergeMode, setMergeMode] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<SupportCategory[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAppeals();
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function toggleCategory(key: SupportCategory) {
    setSelectedCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function loadAppeals() {
    setLoading(true);
    try {
      const response = await fetch("/api/appeals?status=all", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as AppealsResponse;
      setAppeals(data.appeals);
      setCourierDrafts((current) => {
        const next = { ...current };
        for (const appeal of data.appeals) {
          next[appeal.id] ??= toCourierDraft(appeal);
        }
        return next;
      });
      setAppealDrafts((current) => {
        const next = { ...current };
        for (const appeal of data.appeals) {
          next[appeal.id] ??= toAppealDraft(appeal);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendReply(id: string, close = false) {
    const text = replyText[id]?.trim();
    if (!text) return;
    const response = await fetch(`/api/appeals/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, close }),
    });
    if (response.ok) {
      setReplyText((current) => ({ ...current, [id]: "" }));
      await loadAppeals();
    }
  }

  async function close(id: string) {
    const response = await fetch(`/api/appeals/${id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultText: replyText[id] || "Обращение обработано" }),
    });
    if (response.ok) await loadAppeals();
  }

  async function saveAppeal(appeal: Appeal, options?: { status?: "open" | "closed" }) {
    const draft = appealDrafts[appeal.id];
    if (!draft) return;
    const response = await fetch(`/api/appeals/${appeal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueText: draft.issueText,
        resultText: draft.resultText,
        operatorReply: draft.operatorReply,
        status: options?.status,
      }),
    });
    if (response.ok) await loadAppeals();
  }

  async function reopenAppeal(id: string) {
    const response = await fetch(`/api/appeals/${id}/reopen`, { method: "POST" });
    if (response.ok) await loadAppeals();
  }

  async function mergeInto(primary: Appeal) {
    const selectedIds = Object.entries(mergeSelection)
      .filter(([id, checked]) => checked && id !== primary.id)
      .map(([id]) => id);
    if (selectedIds.length === 0) return;

    const response = await fetch(`/api/appeals/${primary.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appealIds: selectedIds }),
    });
    if (response.ok) {
      setMergeSelection({});
      setMergeMode(false);
      await loadAppeals();
    }
  }

  async function saveCourier(appeal: Appeal) {
    const draft = courierDrafts[appeal.id];
    if (!draft) return;
    const response = await fetch(`/api/appeals/${appeal.id}/courier`, {
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
        tags: draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    if (response.ok) await loadAppeals();
  }

  async function saveClassification(appealId: string, category: SupportCategory) {
    const response = await fetch(`/api/appeals/${appealId}/classification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (response.ok) await loadAppeals();
  }

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
      if (selectedCategories.length > 0 && !selectedCategories.includes(resolveAppealCategoryKey(appeal))) {
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

  const visibleAppeals = useMemo(() => {
    return baseFilteredAppeals.filter((appeal) => {
      if (statusFilter === "open" && appeal.status === "closed") return false;
      if (statusFilter === "closed" && appeal.status !== "closed") return false;
      return true;
    });
  }, [baseFilteredAppeals, statusFilter]);

  const openCount = baseFilteredAppeals.filter((a) => a.status !== "closed").length;
  const closedCount = baseFilteredAppeals.filter((a) => a.status === "closed").length;
  const totalCount = baseFilteredAppeals.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Header
        courierFilter={courierFilter}
        mergeMode={mergeMode}
        onToggleMergeMode={() => {
          setMergeMode((value) => !value);
          setMergeSelection({});
        }}
        onRefresh={() => void loadAppeals()}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Открытые"
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
          value={totalCount}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
      </div>

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

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        {loading ? (
          <div className="text-sm text-zinc-500">Загружаем обращения…</div>
        ) : visibleAppeals.length === 0 ? (
          <div className="text-sm text-zinc-500">Обращений по фильтрам не найдено.</div>
        ) : (
          <div className="space-y-2">
            {visibleAppeals.map((appeal) => {
              const expanded = expandedId === appeal.id;
              const categoryKey = resolveAppealCategoryKey(appeal);
              const categoryLabel = getCategoryLabel(categoryKey);
              const needsType = appealNeedsManualClassification(appeal);
              return (
                <article
                  key={appeal.id}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : appeal.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900"
                  >
                    {mergeMode ? (
                      <input
                        type="checkbox"
                        checked={Boolean(mergeSelection[appeal.id])}
                        onChange={(event) => {
                          event.stopPropagation();
                          setMergeSelection((current) => ({
                            ...current,
                            [appeal.id]: event.target.checked,
                          }));
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded border-zinc-600 bg-zinc-900 text-sky-500"
                      />
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
                              setExpandedId(appeal.id);
                              return;
                            }
                            toggleCategory(categoryKey);
                          }}
                        />
                        <StatusBadge appeal={appeal} />
                        {appeal.mergedAppeals.length > 0 ? (
                          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">
                            контур · {appeal.mergedAppeals.length + 1}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {new Date(appeal.createdAt).toLocaleString("ru-RU")}
                        {appeal.courierLastName ? ` · ${appeal.courierLastName}` : appeal.senderName ? ` · ${appeal.senderName}` : ""}
                        {appeal.phone ? ` · ${appeal.phone}` : ""}
                      </div>
                      <div className="mt-1 truncate text-sm text-zinc-400">
                        {appeal.issueText.split("\n").find((line) => line.startsWith("Проблема:"))?.replace("Проблема:", "").trim() ??
                          appeal.issueText.slice(0, 120)}
                      </div>
                    </div>
                    <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-zinc-800 p-4">
                      <AppealClassificationEditor
                        appeal={appeal}
                        categoryKey={categoryKey}
                        needsManual={needsType}
                        onSave={(category) => void saveClassification(appeal.id, category)}
                      />
                      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                        <div>
                          <AppealEditor
                            appeal={appeal}
                            draft={appealDrafts[appeal.id] ?? toAppealDraft(appeal)}
                            onChange={(draft) =>
                              setAppealDrafts((current) => ({ ...current, [appeal.id]: draft }))
                            }
                            onSave={(options) => void saveAppeal(appeal, options)}
                            onReopen={() => void reopenAppeal(appeal.id)}
                          />

                          {appeal.photoUrl ? (
                            <a href={appeal.photoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-sky-400 hover:text-sky-300">
                              Открыть фото
                            </a>
                          ) : null}

                          {appeal.photoAnalysis ? (
                            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                              <span className="text-zinc-500">AI по фото:</span> {appeal.photoAnalysis}
                            </div>
                          ) : null}

                          <MessageHistory appeal={appeal} />
                          <MergedContour appeals={appeal.mergedAppeals} />

                          <AppealReplyPanel
                            appeal={appeal}
                            replyText={replyText[appeal.id] ?? appealDrafts[appeal.id]?.operatorReply ?? ""}
                            onReplyChange={(text) =>
                              setReplyText((current) => ({ ...current, [appeal.id]: text }))
                            }
                            onSend={(close) => void sendReply(appeal.id, close)}
                            onClose={() => void close(appeal.id)}
                          />

                          {mergeMode ? (
                            <MergePanel
                              primary={appeal}
                              selectedCount={Object.values(mergeSelection).filter(Boolean).length}
                              onMerge={() => void mergeInto(appeal)}
                            />
                          ) : null}
                        </div>

                        <CourierCard
                          appeal={appeal}
                          draft={courierDrafts[appeal.id] ?? toCourierDraft(appeal)}
                          onChange={(draft) =>
                            setCourierDrafts((current) => ({ ...current, [appeal.id]: draft }))
                          }
                          onSave={() => void saveCourier(appeal)}
                        />
                      </div>
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

function Header({
  courierFilter,
  mergeMode,
  onToggleMergeMode,
  onRefresh,
}: {
  courierFilter: string | null;
  mergeMode: boolean;
  onToggleMergeMode: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs text-zinc-600">MAX · обращения курьеров</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Обращения</h1>
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
        <button
          type="button"
          onClick={onToggleMergeMode}
          className={
            mergeMode
              ? "rounded-lg border border-violet-400/50 bg-violet-500/10 px-4 py-2 text-sm text-violet-100"
              : "rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          }
        >
          {mergeMode ? "Отменить объединение" : "Объединить обращения"}
        </button>
        <button type="button" onClick={onRefresh} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white">
          Обновить
        </button>
      </div>
    </div>
  );
}

function CategoryBadge({
  label,
  active,
  warning,
  onClick,
}: {
  label: string;
  active: boolean;
  warning?: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick(event as unknown as React.MouseEvent);
      }}
      className={
        warning
          ? "cursor-pointer rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-100"
          : active
            ? "cursor-pointer rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-100"
            : "cursor-pointer rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500"
      }
    >
      {label}
    </span>
  );
}

function AppealClassificationEditor({
  appeal,
  categoryKey,
  needsManual,
  onSave,
}: {
  appeal: Appeal;
  categoryKey: SupportCategory | "other";
  needsManual: boolean;
  onSave: (category: SupportCategory) => void;
}) {
  const [value, setValue] = useState<SupportCategory>(categoryKey === "other" ? "other" : categoryKey);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(categoryKey === "other" ? "other" : categoryKey);
  }, [categoryKey, appeal.id]);

  const sourceLabel =
    appeal.classificationSource === "operator"
      ? "Назначено оператором"
      : needsManual
        ? "Тип не определён автоматически"
        : "Определено автоматически";

  async function handleSave() {
    if (value === categoryKey && !needsManual) return;
    setSaving(true);
    try {
      await onSave(value);
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
            onChange={(event) => setValue(event.target.value as SupportCategory)}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
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
          disabled={saving || (value === categoryKey && !needsManual)}
          onClick={() => void handleSave()}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
        >
          {saving ? "Сохраняем…" : "Сохранить тип"}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ appeal }: { appeal: Appeal }) {
  const autoResolved =
    appeal.status === "closed" &&
    Boolean(appeal.aiSuggestedReply) &&
    appeal.resultText === appeal.aiSuggestedReply;

  return (
    <span
      className={
        autoResolved
          ? "rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200"
          : appeal.status === "closed"
            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
            : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200"
      }
    >
      {autoResolved ? "AI ответил" : appeal.status === "closed" ? "закрыто" : "ждёт оператора"}
    </span>
  );
}

function AppealEditor({
  appeal,
  draft,
  onChange,
  onSave,
  onReopen,
}: {
  appeal: Appeal;
  draft: AppealDraft;
  onChange: (draft: AppealDraft) => void;
  onSave: (options?: { status?: "open" | "closed" }) => void;
  onReopen: () => void;
}) {
  const autoResolved =
    appeal.status === "closed" &&
    Boolean(appeal.aiSuggestedReply) &&
    appeal.resultText === appeal.aiSuggestedReply;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Карточка обращения</div>
        {autoResolved ? (
          <span className="text-xs text-blue-300">Закрыто AI — можно исправить</span>
        ) : appeal.status === "closed" ? (
          <span className="text-xs text-zinc-500">Закрытое обращение</span>
        ) : null}
      </div>

      <label className="mt-3 block text-xs text-zinc-500">
        Описание / данные обращения
        <textarea
          value={draft.issueText}
          onChange={(event) => onChange({ ...draft, issueText: event.target.value })}
          rows={8}
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>

      <label className="mt-3 block text-xs text-zinc-500">
        Итоговый ответ / результат
        <textarea
          value={draft.resultText}
          onChange={(event) => onChange({ ...draft, resultText: event.target.value })}
          rows={4}
          placeholder="Текст, который увидит курьер как итог"
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave()}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Сохранить изменения
        </button>
        {appeal.status === "closed" ? (
          <button
            type="button"
            onClick={onReopen}
            className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-200"
          >
            Открыть снова
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSave({ status: "closed" })}
            className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-200"
          >
            Сохранить и закрыть
          </button>
        )}
      </div>
    </div>
  );
}

function AppealReplyPanel({
  appeal,
  replyText,
  onReplyChange,
  onSend,
  onClose,
}: {
  appeal: Appeal;
  replyText: string;
  onReplyChange: (text: string) => void;
  onSend: (close: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      {appeal.aiSummary && appeal.status !== "closed" ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          {appeal.aiSummary}
          <div className="mt-1 text-xs text-amber-200/80">
            AI не смог закрыть обращение автоматически — нужен ответ оператора.
          </div>
        </div>
      ) : null}
      <label className="block text-xs text-zinc-500">
        Ответ оператора в MAX
        <textarea
          value={replyText}
          onChange={(event) => onReplyChange(event.target.value)}
          placeholder="Сообщение курьеру в MAX"
          rows={3}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSend(false)}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Отправить в MAX
        </button>
        <button
          type="button"
          onClick={() => onSend(true)}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          Отправить и закрыть
        </button>
        {appeal.status !== "closed" ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200"
          >
            Закрыть без отправки
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MergedContour({ appeals }: { appeals: Appeal[] }) {
  if (appeals.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-violet-300">Единый контур</div>
      <div className="space-y-2">
        {appeals.map((appeal) => (
          <div key={appeal.id} className="rounded-lg border border-violet-500/10 bg-zinc-950/80 p-3 text-sm">
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

function MergePanel({
  primary,
  selectedCount,
  onMerge,
}: {
  primary: Appeal;
  selectedCount: number;
  onMerge: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
      <div className="text-sm font-medium text-violet-100">Объединение в контур</div>
      <p className="mt-2 text-xs text-violet-100/80">
        Отметьте другие обращения чекбоксами в списке и объедините их с №{primary.appealNumber}.
        История и сообщения перейдут сюда, вторичные обращения будут закрыты.
      </p>
      <button
        type="button"
        disabled={selectedCount === 0}
        onClick={onMerge}
        className="mt-3 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
      >
        Объединить выбранные ({selectedCount})
      </button>
    </div>
  );
}

function MessageHistory({ appeal }: { appeal: Appeal }) {
  if (appeal.messages.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">История</div>
      <div className="space-y-2">
        {appeal.messages.map((message) => (
          <div key={message.id} className="text-xs text-zinc-400">
            <span className="text-zinc-500">
              {new Date(message.createdAt).toLocaleString("ru-RU")} · {message.direction}
            </span>
            <div className="mt-1 whitespace-pre-wrap text-zinc-300">{message.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CourierCard({
  appeal,
  draft,
  onChange,
  onSave,
}: {
  appeal: Appeal;
  draft: CourierDraft;
  onChange: (draft: CourierDraft) => void;
  onSave: () => void;
}) {
  return (
    <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">Карточка курьера</div>
        {appeal.maxUserId ? (
          <Link href={`/dashboard/couriers?search=${encodeURIComponent(draft.lastName || draft.phone || appeal.maxUserId)}`} className="text-xs text-sky-400 hover:text-sky-300">
            В базе
          </Link>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        <Field label="Имя" value={draft.displayName ?? ""} onChange={(displayName) => onChange({ ...draft, displayName })} />
        <Field label="Фамилия" value={draft.lastName ?? ""} onChange={(lastName) => onChange({ ...draft, lastName })} />
        <Field label="Телефон" value={draft.phone ?? ""} onChange={(phone) => onChange({ ...draft, phone })} />
        <Field label="Модель телефона" value={draft.phoneModel ?? ""} onChange={(phoneModel) => onChange({ ...draft, phoneModel })} />
        <Field label="ОС" value={draft.os ?? ""} onChange={(os) => onChange({ ...draft, os })} />
        <Field label="Версия приложения" value={draft.appVersion ?? ""} onChange={(appVersion) => onChange({ ...draft, appVersion })} />
        <Field label="Теги" value={draft.tagsText} onChange={(tagsText) => onChange({ ...draft, tagsText })} />
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
      <div className="mt-3 text-xs text-zinc-500">Обращений: {appeal.courierProfile?.totalAppeals ?? 0}</div>
      <button type="button" onClick={onSave} className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500">
        Сохранить карточку
      </button>
    </aside>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
}) {
  const hasRange = Boolean(dateFrom || dateTo);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        От
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        До
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(event) => onDateToChange(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500 [color-scheme:dark]"
        />
      </label>
      {hasRange ? (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}

function isAppealInDateRange(createdAt: string, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;

  const timestamp = new Date(createdAt).getTime();
  let from = dateFrom ? startOfDay(dateFrom) : null;
  let to = dateTo ? endOfDay(dateTo) : null;

  if (from != null && to != null && from > to) {
    from = startOfDay(dateTo);
    to = endOfDay(dateFrom);
  }

  if (from != null && timestamp < from) return false;
  if (to != null && timestamp > to) return false;
  return true;
}

function startOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function endOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl border border-sky-400/50 bg-sky-500/10 p-4 text-left transition hover:border-sky-400/70"
          : "rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:border-zinc-600"
      }
    >
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </button>
  );
}

const CategoryFilterDropdown = forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    onToggle: () => void;
    selected: SupportCategory[];
    counts: Map<string, number>;
    onToggleCategory: (key: SupportCategory) => void;
    onClear: () => void;
  }
>(function CategoryFilterDropdown(
  { open, onToggle, selected, counts, onToggleCategory, onClear },
  ref,
) {
  const label =
    selected.length === 0
      ? "Тип проблемы: все"
      : selected.length === 1
        ? getCategoryLabel(selected[0])
        : `Тип проблемы: ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600 lg:min-w-[220px]"
      >
        <span className="truncate">{label}</span>
        <span className="text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 max-h-80 w-full min-w-[280px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl lg:w-[320px]">
          <div className="mb-2 flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Тип проблемы</span>
            {selected.length > 0 ? (
              <button type="button" onClick={onClear} className="text-xs text-sky-400 hover:text-sky-300">
                Сбросить
              </button>
            ) : null}
          </div>
          {SUPPORT_CATEGORY_CATALOG.map((item) => {
            const checked = selected.includes(item.key);
            const count = counts.get(item.key) ?? 0;
            return (
              <label
                key={item.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleCategory(item.key)}
                  className="rounded border-zinc-600 bg-zinc-900 text-sky-500"
                />
                <span className="flex-1 text-sm text-zinc-200">{item.label}</span>
                <span className="text-xs text-zinc-500">{count}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

function toAppealDraft(appeal: Appeal): AppealDraft {
  return {
    issueText: appeal.issueText,
    resultText: appeal.resultText ?? appeal.aiSuggestedReply ?? appeal.operatorReply ?? "",
    operatorReply: appeal.operatorReply ?? appeal.aiSuggestedReply ?? "",
  };
}

function toCourierDraft(appeal: Appeal): CourierDraft {
  const profile = appeal.courierProfile;
  return {
    displayName: profile?.displayName ?? appeal.senderName ?? "",
    lastName: profile?.lastName ?? appeal.courierLastName ?? "",
    phone: profile?.phone ?? appeal.phone ?? "",
    phoneModel: profile?.phoneModel ?? appeal.phoneModel ?? "",
    os: profile?.os ?? appeal.os ?? "",
    appVersion: profile?.appVersion ?? appeal.appVersion ?? "",
    notes: profile?.notes ?? "",
    tagsText: profile?.tags?.join(", ") ?? "",
  };
}
