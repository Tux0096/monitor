"use client";

import type { Appeal } from "@/lib/appeals";
import { useState } from "react";

const DIRECTION_LABELS: Record<string, string> = {
  in: "пользователь",
  bot: "бот",
  operator: "оператор",
  ai: "ai",
  system: "система",
};

export function messageDirectionLabel(direction: Appeal["messages"][number]["direction"]) {
  return DIRECTION_LABELS[direction] ?? direction;
}

export function MessageHistory({ appeal }: { appeal: Appeal }) {
  if (appeal.messages.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">История</div>
      <div className="space-y-2">
        {appeal.messages.map((message) => (
          <div key={message.id} className="text-xs text-zinc-400">
            <span className="text-zinc-500">
              {new Date(message.createdAt).toLocaleString("ru-RU")} ·{" "}
              {messageDirectionLabel(message.direction)}
            </span>
            <div className="mt-1 whitespace-pre-wrap text-zinc-300">{message.text}</div>
            {message.photoUrl ? (
              <a href={message.photoUrl} target="_blank" rel="noreferrer" className="mt-2 block max-w-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.photoUrl}
                  alt="Фото"
                  className="max-h-48 w-full rounded-lg border border-zinc-800 bg-zinc-900 object-contain"
                />
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperatorChatReply({
  appeal,
  disabled,
  onSend,
}: {
  appeal: Appeal;
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel =
    appeal.source === "telegram" || appeal.maxUserId?.startsWith("tg:")
      ? "Telegram"
      : appeal.source === "max"
        ? "MAX"
        : null;
  const canReply = Boolean(appeal.maxChatId) && appeal.status !== "closed" && !disabled;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setText("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  if (!canReply) return null;

  return (
    <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <div className="text-sm font-medium text-sky-100">Ответ в чат</div>
      <p className="mt-1 text-xs text-sky-100/70">
        Сообщение уйдёт в {channel ?? "мессенджер"} с привязкой: «Обращение №{appeal.appealNumber}: …»
      </p>
      <label className="mt-3 block text-xs text-zinc-500">
        Текст для курьера
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="Например: скажите ваш номер телефона"
          className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500/50"
        />
      </label>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      <button
        type="button"
        disabled={sending || !text.trim()}
        onClick={() => void handleSend()}
        className="mt-3 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400 disabled:opacity-40"
      >
        {sending ? "Отправляем…" : "Отправить в чат"}
      </button>
    </div>
  );
}
