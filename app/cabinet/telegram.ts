"use client";

/**
 * Тонкая обёртка над Telegram WebApp.
 *
 * Отдельным модулем, чтобы не тащить `any` по всему приложению и чтобы
 * кабинет открывался в обычном браузере при разработке — там объекта
 * Telegram нет, и всё должно деградировать молча, а не падать.
 */

type ThemeParams = Record<string, string | undefined>;

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  themeParams?: ThemeParams;
  colorScheme?: "light" | "dark";
  expand?: () => void;
  ready?: () => void;
  requestContact?: (cb: (ok: boolean, res?: unknown) => void) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
  onEvent?: (event: string, cb: () => void) => void;
};

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

/**
 * Тема из themeParams в CSS-переменные.
 *
 * Цвета берём у Telegram, а не задаём свои: иначе кабинет будет
 * выглядеть чужеродно на фоне остального клиента, и особенно заметно
 * это в тёмной теме.
 */
export function applyTheme(): void {
  const tg = getWebApp();
  const root = document.documentElement;
  const params = tg?.themeParams ?? {};

  const map: Record<string, string> = {
    "--tg-bg": params.bg_color ?? "#18181b",
    "--tg-text": params.text_color ?? "#fafafa",
    "--tg-hint": params.hint_color ?? "#a1a1aa",
    "--tg-link": params.link_color ?? "#38bdf8",
    "--tg-button": params.button_color ?? "#38bdf8",
    "--tg-button-text": params.button_text_color ?? "#ffffff",
    "--tg-secondary-bg": params.secondary_bg_color ?? "#27272a",
  };
  for (const [key, value] of Object.entries(map)) root.style.setProperty(key, value);
}

/** Разбор deep-link: `news_42`, `kb_17`, `benefit_3`. */
export function parseStartParam(raw: string | undefined): { screen: string; id: number } | null {
  if (!raw) return null;
  const match = /^(news|kb|benefit)_(\d+)$/.exec(raw);
  if (!match) return null;
  const screens: Record<string, string> = { news: "news", kb: "kb", benefit: "benefits" };
  return { screen: screens[match[1]], id: Number(match[2]) };
}
