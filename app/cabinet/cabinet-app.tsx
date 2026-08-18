"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { applyTheme, getWebApp, parseStartParam } from "./telegram";

type Profile = {
  workerId: number;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  post: string | null;
  department: string | null;
  company: string | null;
  city: string | null;
  employmentDate: string | null;
  phone: string | null;
  chief?: { lastName: string | null; firstName: string | null } | null;
};

type NewsItem = {
  id: number;
  title: string;
  lead: string | null;
  publish_at: string | null;
  is_read: boolean;
};

type Benefit = {
  id: number;
  title: string;
  description_md: string;
  kind: string;
  shared_code: string | null;
  personal_code: string | null;
  claimed: boolean;
  free_codes: number;
};

type Screen = "home" | "news" | "kb" | "benefits" | "profile";

const TABS: Array<{ key: Screen; label: string }> = [
  { key: "home", label: "Главная" },
  { key: "news", label: "Новости" },
  { key: "kb", label: "База знаний" },
  { key: "benefits", label: "Бонусы" },
  { key: "profile", label: "Профиль" },
];

function fullName(p: Profile | null): string {
  if (!p) return "";
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

export function CabinetApp() {
  // Access-токен живём только в памяти: WebView делит localStorage
  // между Mini App'ами, и токен утёк бы к соседнему приложению.
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [sections, setSections] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "link" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (accessRef.current) headers.set("Authorization", `Bearer ${accessRef.current}`);
      if (init.body) headers.set("Content-Type", "application/json");

      let response = await fetch(`/api/cabinet/${path}`, { ...init, headers });

      // Интерсептор 401: обновляем токен и повторяем исходный запрос один раз.
      if (response.status === 401 && refreshRef.current) {
        const refreshed = await fetch("/api/cabinet/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: refreshRef.current }),
        });
        if (refreshed.ok) {
          const tokens = (await refreshed.json()) as { access: string; refresh: string };
          accessRef.current = tokens.access;
          refreshRef.current = tokens.refresh;
          headers.set("Authorization", `Bearer ${tokens.access}`);
          response = await fetch(`/api/cabinet/${path}`, { ...init, headers });
        }
      }
      return response;
    },
    [],
  );

  const login = useCallback(async () => {
    const tg = getWebApp();
    if (!tg?.initData) {
      setStatus("error");
      setMessage("Откройте кабинет из Telegram — вне мессенджера вход невозможен.");
      return;
    }

    const response = await fetch("/api/cabinet/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData }),
    });

    if (response.status === 409) {
      setStatus("link");
      return;
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { detail?: string } | null;
      setStatus("error");
      setMessage(data?.detail ?? "Не удалось войти");
      return;
    }

    const data = (await response.json()) as {
      access: string;
      refresh: string;
      profile: Profile;
    };
    accessRef.current = data.access;
    refreshRef.current = data.refresh;
    setProfile(data.profile);
    setStatus("ready");

    const deep = parseStartParam(tg.initDataUnsafe?.start_param);
    if (deep) setScreen(deep.screen as Screen);
  }, []);

  const requestContact = useCallback(() => {
    const tg = getWebApp();
    if (!tg?.requestContact) {
      setMessage("Ваша версия Telegram не поддерживает передачу контакта.");
      return;
    }
    tg.requestContact(async (ok, result) => {
      if (!ok) return;
      const contact = (result as { responseUnsafe?: { contact?: unknown } })?.responseUnsafe
        ?.contact;
      const response = await fetch("/api/cabinet/auth/link/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: tg.initData, contact }),
      });
      if (response.status === 202) {
        setMessage("Заявка отправлена администратору. Дождитесь подтверждения.");
        return;
      }
      if (response.ok) {
        const data = (await response.json()) as {
          access: string;
          refresh: string;
          profile: Profile;
        };
        accessRef.current = data.access;
        refreshRef.current = data.refresh;
        setProfile(data.profile);
        setStatus("ready");
      }
    });
  }, []);

  useEffect(() => {
    applyTheme();
    const tg = getWebApp();
    tg?.ready?.();
    tg?.expand?.();
    tg?.onEvent?.("themeChanged", applyTheme);
    void login();
  }, [login]);

  useEffect(() => {
    if (status !== "ready") return;
    if (screen === "news" || screen === "home") {
      void api("news?limit=20")
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items: NewsItem[] }) => setNews(d.items ?? []));
    }
    if (screen === "benefits") {
      void api("benefits")
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items: Benefit[] }) => setBenefits(d.items ?? []));
    }
    if (screen === "kb") {
      void api("kb/sections")
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items: Array<Record<string, unknown>> }) => setSections(d.items ?? []));
    }
  }, [screen, status, api]);

  const claim = useCallback(
    async (benefitId: number) => {
      const response = await api(`benefits/${benefitId}/claim`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as
        | { code?: string; detail?: string }
        | null;
      if (response.ok && data?.code) {
        setBenefits((prev) =>
          prev.map((b) =>
            b.id === benefitId ? { ...b, personal_code: data.code!, claimed: true } : b,
          ),
        );
        return;
      }
      setMessage(data?.detail ?? "Не удалось получить код");
    },
    [api],
  );

  if (status === "loading") {
    return <div className="cab-center">Загружаем…</div>;
  }

  if (status === "link") {
    return (
      <div className="cab-center cab-stack">
        <h1 className="cab-h1">Нужна привязка</h1>
        <p className="cab-hint">
          Мы не нашли ваш Telegram в базе сотрудников. Поделитесь номером,
          привязанным к аккаунту — он сверится с вашей учётной записью.
        </p>
        <button type="button" className="cab-button" onClick={requestContact}>
          Поделиться номером
        </button>
        {message ? <p className="cab-hint">{message}</p> : null}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="cab-center cab-stack">
        <h1 className="cab-h1">Не удалось войти</h1>
        <p className="cab-hint">{message}</p>
      </div>
    );
  }

  return (
    <div className="cab-root">
      <main className="cab-main">
        {screen === "home" ? (
          <>
            <section className="cab-card">
              <div className="cab-name">{fullName(profile)}</div>
              <div className="cab-hint">{profile?.post ?? "—"}</div>
              <div className="cab-meta">
                {profile?.department ?? "—"}
                {profile?.city ? ` · ${profile.city}` : ""}
              </div>
            </section>
            <h2 className="cab-h2">Свежие новости</h2>
            {news.length === 0 ? (
              <p className="cab-hint">Пока ничего нет.</p>
            ) : (
              news.slice(0, 5).map((item) => (
                <article key={item.id} className="cab-card">
                  <div className="cab-title">{item.title}</div>
                  {item.lead ? <div className="cab-hint">{item.lead}</div> : null}
                  <div className="cab-meta">{formatDate(item.publish_at)}</div>
                </article>
              ))
            )}
          </>
        ) : null}

        {screen === "news" ? (
          <>
            <h2 className="cab-h2">Новости</h2>
            {news.length === 0 ? <p className="cab-hint">Пока ничего нет.</p> : null}
            {news.map((item) => (
              <article key={item.id} className="cab-card">
                <div className="cab-title">
                  {item.is_read ? null : <span className="cab-dot" />}
                  {item.title}
                </div>
                {item.lead ? <div className="cab-hint">{item.lead}</div> : null}
                <div className="cab-meta">{formatDate(item.publish_at)}</div>
              </article>
            ))}
          </>
        ) : null}

        {screen === "kb" ? (
          <>
            <h2 className="cab-h2">База знаний</h2>
            {sections.length === 0 ? (
              <p className="cab-hint">Разделов пока нет.</p>
            ) : (
              sections.map((section) => (
                <article key={String(section.id)} className="cab-card">
                  <div className="cab-title">{String(section.title)}</div>
                  <div className="cab-meta">{String(section.articles)} материалов</div>
                </article>
              ))
            )}
          </>
        ) : null}

        {screen === "benefits" ? (
          <>
            <h2 className="cab-h2">Бонусы</h2>
            {benefits.length === 0 ? <p className="cab-hint">Пока ничего нет.</p> : null}
            {benefits.map((benefit) => (
              <article key={benefit.id} className="cab-card">
                <div className="cab-title">{benefit.title}</div>
                <div className="cab-hint">{benefit.description_md}</div>
                {benefit.kind === "shared" && benefit.shared_code ? (
                  <div className="cab-code">{benefit.shared_code}</div>
                ) : null}
                {benefit.kind === "personal" ? (
                  benefit.personal_code ? (
                    <div className="cab-code">{benefit.personal_code}</div>
                  ) : (
                    <button
                      type="button"
                      className="cab-button"
                      disabled={benefit.free_codes === 0}
                      onClick={() => void claim(benefit.id)}
                    >
                      {benefit.free_codes === 0 ? "Промокоды закончились" : "Получить промокод"}
                    </button>
                  )
                ) : null}
              </article>
            ))}
          </>
        ) : null}

        {screen === "profile" ? (
          <>
            <h2 className="cab-h2">Профиль</h2>
            <section className="cab-card">
              <dl className="cab-dl">
                <dt>ФИО</dt>
                <dd>{fullName(profile)}</dd>
                <dt>Должность</dt>
                <dd>{profile?.post ?? "—"}</dd>
                <dt>Предприятие</dt>
                <dd>{profile?.department ?? "—"}</dd>
                <dt>Компания</dt>
                <dd>{profile?.company ?? "—"}</dd>
                <dt>В компании с</dt>
                <dd>{formatDate(profile?.employmentDate ?? null)}</dd>
                <dt>Руководитель</dt>
                <dd>
                  {profile?.chief
                    ? `${profile.chief.lastName ?? ""} ${profile.chief.firstName ?? ""}`.trim()
                    : "—"}
                </dd>
              </dl>
            </section>
          </>
        ) : null}

        {message ? <p className="cab-toast">{message}</p> : null}
      </main>

      <nav className="cab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={screen === tab.key ? "cab-tab cab-tab-active" : "cab-tab"}
            onClick={() => {
              setMessage(null);
              setScreen(tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
