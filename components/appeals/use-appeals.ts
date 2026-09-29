"use client";

import type { Appeal } from "@/lib/appeals";
import type { AppealResolutionMethod } from "@/lib/appeal-intake-sources";
import type { SupportCategory } from "@/lib/support-classifier";
import { useCallback, useEffect, useState } from "react";

import {
  toAppealDraft,
  toCourierDraft,
  type AppealDraft,
  type AppealsResponse,
  type CourierDraft,
} from "./types";

export type AppealsView = "active" | "trash";

const POLL_INTERVAL_MS = 15_000;

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/**
 * Данные и операции экрана обращений.
 *
 * Раньше загрузка, черновики и десяток мутаций жили прямо в компоненте страницы
 * вперемешку с разметкой. Хук собирает их в одном месте: компоненты получают
 * готовые действия и не знают про URL эндпоинтов.
 */
export function useAppeals(view: AppealsView) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courierDrafts, setCourierDrafts] = useState<Record<string, CourierDraft>>({});
  const [appealDrafts, setAppealDrafts] = useState<Record<string, AppealDraft>>({});

  const loadAppeals = useCallback(
    async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const response = await fetch(`/api/appeals?status=all&view=${view}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setError(await readError(response, "Не удалось загрузить обращения"));
        return;
      }
      setError(null);
      const data = (await response.json()) as AppealsResponse;
      setAppeals(data.appeals);
      setCourierDrafts((current) => {
        const next = { ...current };
        for (const appeal of data.appeals) next[appeal.id] ??= toCourierDraft(appeal);
        return next;
      });
      setAppealDrafts((current) => {
        const next = { ...current };
        for (const appeal of data.appeals) next[appeal.id] ??= toAppealDraft(appeal);
        return next;
      });
    } finally {
      if (!options?.silent) setLoading(false);
    }
    },
    [view],
  );

  useEffect(() => {
    void loadAppeals();
    const interval = window.setInterval(() => void loadAppeals({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadAppeals]);

  /** Заменяет обращение в списке и пересобирает его черновики под свежие данные. */
  const applyAppeal = useCallback((appeal: Appeal) => {
    setAppeals((current) => current.map((item) => (item.id === appeal.id ? appeal : item)));
    setAppealDrafts((current) => ({ ...current, [appeal.id]: toAppealDraft(appeal) }));
  }, []);

  const setAppealDraft = useCallback((id: string, draft: AppealDraft) => {
    setAppealDrafts((current) => ({ ...current, [id]: draft }));
  }, []);

  const setCourierDraft = useCallback((id: string, draft: CourierDraft) => {
    setCourierDrafts((current) => ({ ...current, [id]: draft }));
  }, []);

  const resetAppealDraft = useCallback((appeal: Appeal) => {
    setAppealDrafts((current) => ({ ...current, [appeal.id]: toAppealDraft(appeal) }));
  }, []);

  const markRead = useCallback(async (id: string) => {
    const response = await fetch(`/api/appeals/${id}/read`, { method: "POST" });
    if (!response.ok) return;
    setAppeals((current) =>
      current.map((appeal) => (appeal.id === id ? { ...appeal, unreadCount: 0 } : appeal)),
    );
  }, []);

  /** PATCH обращения одним запросом; возвращает текст ошибки либо null. */
  const patchAppeal = useCallback(
    async (id: string, body: Record<string, unknown>): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return readError(response, "Не удалось сохранить обращение");
      const data = (await response.json()) as { appeal: Appeal };
      applyAppeal(data.appeal);
      return null;
    },
    [applyAppeal],
  );

  const saveAppeal = useCallback(
    async (appeal: Appeal): Promise<string | null> => {
      const draft = appealDrafts[appeal.id];
      if (!draft) return null;
      return patchAppeal(appeal.id, {
        issueText: draft.issueText,
        resultText: draft.resultText,
        pointId: draft.pointId || null,
      });
    },
    [appealDrafts, patchAppeal],
  );

  const saveAppealPoint = useCallback(
    async (id: string, pointId: string | null) => (await patchAppeal(id, { pointId })) === null,
    [patchAppeal],
  );

  const takeInProgress = useCallback(
    (id: string) => patchAppeal(id, { status: "in_progress" }),
    [patchAppeal],
  );

  const closeAppeal = useCallback(
    async (
      id: string,
      input: { resultText: string; category?: SupportCategory; resolutionMethod?: AppealResolutionMethod | null },
    ): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) return readError(response, "Не удалось закрыть обращение");
      const data = (await response.json()) as { appeal: Appeal };
      applyAppeal(data.appeal);
      return null;
    },
    [applyAppeal],
  );

  const reopenAppeal = useCallback(
    async (id: string): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}/reopen`, { method: "POST" });
      if (!response.ok) return readError(response, "Не удалось открыть обращение снова");
      await loadAppeals({ silent: true });
      return null;
    },
    [loadAppeals],
  );

  /** Мягкое удаление: обращение уезжает в корзину и пропадает из текущего среза. */
  const deleteAppeal = useCallback(
    async (id: string): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}`, { method: "DELETE" });
      if (!response.ok) return readError(response, "Не удалось удалить обращение");
      setAppeals((current) => current.filter((appeal) => appeal.id !== id));
      return null;
    },
    [],
  );

  const restoreAppeal = useCallback(
    async (id: string): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}/restore`, { method: "POST" });
      if (!response.ok) return readError(response, "Не удалось восстановить обращение");
      setAppeals((current) => current.filter((appeal) => appeal.id !== id));
      return null;
    },
    [],
  );

  const sendOperatorReply = useCallback(
    async (id: string, text: string) => {
      const response = await fetch(`/api/appeals/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Не удалось отправить ответ в чат"));
      }
      await loadAppeals({ silent: true });
    },
    [loadAppeals],
  );

  const saveClassification = useCallback(
    async (id: string, category: SupportCategory): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${id}/classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) return readError(response, "Не удалось сохранить тип обращения");
      await loadAppeals({ silent: true });
      return null;
    },
    [loadAppeals],
  );

  const saveCourier = useCallback(
    async (appeal: Appeal): Promise<string | null> => {
      const draft = courierDrafts[appeal.id];
      if (!draft) return null;
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
          pointId: draft.pointId || null,
        }),
      });
      if (!response.ok) return readError(response, "Не удалось сохранить карточку курьера");
      await loadAppeals({ silent: true });
      return null;
    },
    [courierDrafts, loadAppeals],
  );

  const mergeAppeals = useCallback(
    async (primaryId: string, appealIds: string[]): Promise<string | null> => {
      const response = await fetch(`/api/appeals/${primaryId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealIds }),
      });
      if (!response.ok) return readError(response, "Не удалось объединить обращения");
      await loadAppeals({ silent: true });
      return null;
    },
    [loadAppeals],
  );

  return {
    appeals,
    loading,
    error,
    appealDrafts,
    courierDrafts,
    loadAppeals,
    markRead,
    setAppealDraft,
    setCourierDraft,
    resetAppealDraft,
    saveAppeal,
    saveAppealPoint,
    takeInProgress,
    closeAppeal,
    reopenAppeal,
    deleteAppeal,
    restoreAppeal,
    sendOperatorReply,
    saveClassification,
    saveCourier,
    mergeAppeals,
  };
}
