"use client";

import type { Appeal } from "@/lib/appeals";
import type { MouseEvent, KeyboardEvent } from "react";

export function CategoryBadge({
  label,
  active,
  warning,
  onClick,
}: {
  label: string;
  active: boolean;
  warning?: boolean;
  onClick: (event: MouseEvent | KeyboardEvent) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick(event);
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

/** Обращение закрыто автоответом AI — оператор может исправить решение. */
export function isAutoResolved(appeal: Appeal): boolean {
  return (
    appeal.status === "closed" &&
    Boolean(appeal.aiSuggestedReply) &&
    appeal.resultText === appeal.aiSuggestedReply
  );
}

export function StatusBadge({ appeal }: { appeal: Appeal }) {
  if (isAutoResolved(appeal)) {
    return (
      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">
        AI ответил
      </span>
    );
  }
  if (appeal.status === "closed") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
        закрыто
      </span>
    );
  }
  if (appeal.status === "in_progress") {
    return (
      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200">в работе</span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">новое</span>
  );
}

export function DeletedBadge({ deletedAt }: { deletedAt: string | null }) {
  if (!deletedAt) return null;
  return (
    <span
      className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200"
      title={`Удалено ${new Date(deletedAt).toLocaleString("ru-RU")}`}
    >
      в корзине
    </span>
  );
}
