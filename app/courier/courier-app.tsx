"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AppealStatus = "open" | "in_progress" | "closed";

type CourierProfile = {
  displayName: string | null;
  lastName: string | null;
  phone: string | null;
  totalAppeals: number;
  lastAppealAt: string | null;
};

type CourierAppeal = {
  appealNumber: number;
  status: AppealStatus;
  createdAt: string;
  shortText: string;
};

type Bootstrap = {
  needsPhone: boolean;
  profile: CourierProfile;
  appeals: CourierAppeal[];
};

type Screen = "loading" | "phone" | "home" | "form" | "success";

type MaxWebApp = {
  ready: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string };
    chat?: { id: number; type: string };
  };
  requestContact: () => Promise<{ phone: string; authDate: string; hash: string }>;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => Promise<void>;
    notificationOccurred: (type: "error" | "success" | "warning") => Promise<void>;
  };
};

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

function statusLabel(status: AppealStatus) {
  switch (status) {
    case "closed":
      return "Закрыто";
    case "in_progress":
      return "В работе";
    default:
      return "Открыто";
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(profile: CourierProfile) {
  return [profile.displayName, profile.lastName].filter(Boolean).join(" ") || "Курьер";
}

async function postJson<T>(url: string, initData: string, body: Record<string, unknown> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, ...body }),
  });
  const data = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data?.error ?? "Ошибка запроса");
  }
  return data;
}

export function CourierApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [initData, setInitData] = useState("");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [description, setDescription] = useState("");
  const [phoneModel, setPhoneModel] = useState("");
  const [os, setOs] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [successText, setSuccessText] = useState("");

  const webApp = typeof window !== "undefined" ? window.WebApp : undefined;

  const loadSession = useCallback(async (data: string) => {
    const result = await postJson<Bootstrap>("/api/max/app/session", data);
    setBootstrap(result);
    setScreen(result.needsPhone ? "phone" : "home");
    return result;
  }, []);

  useEffect(() => {
    const app = window.WebApp;
    if (!app?.initData) {
      setError("Откройте приложение через кнопку «Открыть» в чате с ботом MAX.");
      setScreen("phone");
      return;
    }

    app.ready();
    setInitData(app.initData);

    loadSession(app.initData).catch((err) => {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
      setScreen("phone");
    });
  }, [loadSession]);

  const goHome = useCallback(() => {
    setScreen("home");
    setDescription("");
    setPhoneModel("");
    setOs("");
    setAppVersion("");
    setPhotoPreview(null);
    setPhotoData(null);
    setError(null);
    webApp?.disableClosingConfirmation();
    webApp?.BackButton.hide();
  }, [webApp]);

  const openForm = useCallback(() => {
    setScreen("form");
    setError(null);
    webApp?.enableClosingConfirmation();
    webApp?.BackButton.show();
  }, [webApp]);

  useEffect(() => {
    const app = window.WebApp;
    if (!app) return;

    const onBack = () => goHome();
    if (screen === "form") {
      app.BackButton.onClick(onBack);
      return () => app.BackButton.offClick(onBack);
    }
    app.BackButton.hide();
    return undefined;
  }, [screen, goHome]);

  async function requestPhone() {
    const app = window.WebApp;
    if (!app) {
      setError("MAX Bridge не загружен");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const contact = await app.requestContact();
      const result = await postJson<Bootstrap>("/api/max/app/phone", initData || app.initData, {
        phone: contact.phone,
        authDate: contact.authDate,
        hash: contact.hash,
      });
      setBootstrap(result);
      setScreen("home");
      await app.HapticFeedback?.notificationOccurred("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось получить телефон";
      if (!/refused|отказ/i.test(message)) {
        setError(message);
      }
      await window.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setPending(false);
    }
  }

  function onPhotoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Можно прикрепить только изображение");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Фото не больше 8 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      setPhotoPreview(result);
      setPhotoData(result);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!initData) return;
    setPending(true);
    setError(null);
    try {
      const result = await postJson<{
        action: string;
        appealNumber: number;
        reply: string;
      }>("/api/max/app/appeals", initData, {
        description,
        phoneModel,
        os,
        appVersion,
        photoData,
      });
      setSuccessText(result.reply);
      setScreen("success");
      webApp?.disableClosingConfirmation();
      webApp?.BackButton.hide();
      const refreshed = await loadSession(initData);
      setBootstrap(refreshed);
      await webApp?.HapticFeedback?.notificationOccurred("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить обращение");
      await webApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setPending(false);
    }
  }

  const profile = bootstrap?.profile;
  const appeals = bootstrap?.appeals ?? [];

  const shellClass =
    "min-h-dvh bg-[linear-gradient(180deg,#102820_0%,#0a1411_38%,#070b0a_100%)] text-zinc-50";

  if (screen === "loading") {
    return (
      <main className={`${shellClass} flex items-center justify-center px-6`}>
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-300" />
          <p className="text-sm text-zinc-400">Загрузка кабинета…</p>
        </div>
      </main>
    );
  }

  if (screen === "phone") {
    return (
      <main className={`${shellClass} px-5 py-8`}>
        <div className="mx-auto max-w-md">
          <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Фуджи · курьеры</p>
            <h1 className="mt-3 text-2xl font-semibold">Личный кабинет</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Номер телефона запрашивается один раз из вашего аккаунта MAX. После этого откроется
              карточка и форма обращения.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            disabled={pending || !webApp}
            onClick={requestPhone}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? "Запрос…" : "Передать мой телефон"}
          </button>
        </div>
      </main>
    );
  }

  if (screen === "form") {
    return (
      <main className={`${shellClass} px-5 py-6 pb-10`}>
        <form className="mx-auto max-w-md space-y-5" onSubmit={submitAppeal}>
          <div>
            <h1 className="text-2xl font-semibold">Новое обращение</h1>
            <p className="mt-2 text-sm text-zinc-400">Заполните форму — оператор получит все данные сразу.</p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Описание проблемы</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              required
              minLength={8}
              placeholder="Что именно не работает? Когда началось?"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-emerald-400/40 placeholder:text-zinc-500 focus:ring-2"
            />
          </label>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Фото или скриншот</p>
                <p className="text-xs text-zinc-400">Помогает быстрее разобраться</p>
              </div>
              <label className="cursor-pointer rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/20">
                Добавить
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Превью"
                className="max-h-48 w-full rounded-xl object-cover"
              />
            ) : null}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Модель телефона</span>
            <input
              value={phoneModel}
              onChange={(e) => setPhoneModel(e.target.value)}
              placeholder="Например, Samsung Galaxy A54"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-emerald-400/40 placeholder:text-zinc-500 focus:ring-2"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Операционная система</span>
            <select
              value={os}
              onChange={(e) => setOs(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-emerald-400/40 focus:ring-2"
            >
              <option value="">Не указано</option>
              <option value="Android">Android</option>
              <option value="iOS">iOS</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-zinc-200">Версия приложения</span>
            <input
              value={appVersion}
              onChange={(e) => setAppVersion(e.target.value)}
              placeholder="Если знаете"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none ring-emerald-400/40 placeholder:text-zinc-500 focus:ring-2"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending || description.trim().length < 8}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? "Отправка…" : "Отправить обращение"}
          </button>
        </form>
      </main>
    );
  }

  if (screen === "success") {
    return (
      <main className={`${shellClass} px-5 py-8`}>
        <div className="mx-auto max-w-md rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6">
          <h1 className="text-xl font-semibold text-emerald-100">Готово</h1>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-100">{successText}</p>
          <button
            type="button"
            onClick={goHome}
            className="mt-6 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-emerald-950"
          >
            Вернуться в кабинет
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`${shellClass} px-5 py-6 pb-10`}>
      <div className="mx-auto max-w-md space-y-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Моя карточка</p>
          <h1 className="mt-2 text-2xl font-semibold">{profile ? displayName(profile) : "Курьер"}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Телефон</dt>
              <dd className="mt-1 font-medium">{profile?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Обращений</dt>
              <dd className="mt-1 font-medium">{profile?.totalAppeals ?? 0}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">Последнее обращение</dt>
              <dd className="mt-1 font-medium">{formatDate(profile?.lastAppealAt ?? null)}</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          onClick={openForm}
          className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          Создать обращение
        </button>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Последние обращения</h2>
          {appeals.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Пока нет обращений</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {appeals.map((appeal) => (
                <li
                  key={appeal.appealNumber}
                  className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">№{appeal.appealNumber}</span>
                    <span className="text-xs text-emerald-300/90">{statusLabel(appeal.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(appeal.createdAt)}</p>
                  <p className="mt-2 text-sm text-zinc-300">{appeal.shortText}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
