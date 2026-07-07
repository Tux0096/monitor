"use client";

import { useCallback, useEffect, useState } from "react";

type PushConfig =
  | { enabled: false }
  | {
      enabled: true;
      apiKey: string;
      authDomain: string;
      projectId: string;
      messagingSenderId: string;
      appId: string;
      vapidKey: string;
    };

type PushState = "unsupported" | "disabled" | "prompt" | "pending" | "enabled" | "denied";

function detectPlatform() {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

export function PushNotificationSetup({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>("pending");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      setState("enabled");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    setState("prompt");
  }, []);

  const enablePush = useCallback(async () => {
    setMessage(null);
    if (typeof window === "undefined") return;

    const configRes = await fetch("/api/push/config", { cache: "no-store" });
    const config = (await configRes.json()) as PushConfig;
    if (!config.enabled) {
      setState("disabled");
      setMessage("Push не настроен: нужен отдельный Firebase-проект Monitor (не fuji-notifications).");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState("denied");
      setMessage("Разрешите уведомления в настройках браузера.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      const { initializeApp } = await import("firebase/app");
      const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

      const app = initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: config.vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        setMessage("Не удалось получить FCM-токен.");
        return;
      }

      const subscribeRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: detectPlatform() }),
      });
      if (!subscribeRes.ok) {
        setMessage("Не удалось сохранить подписку на сервере.");
        return;
      }

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Фуджи · Мониторинг";
        const body = payload.notification?.body ?? "";
        if (document.visibilityState === "visible") {
          new Notification(title, { body, icon: "/icons/monitor-icon.svg" });
        }
      });

      setState("enabled");
      setMessage("Push включён. Добавьте сайт на экран «Домой» для уведомлений в фоне.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка настройки push");
    }
  }, []);

  if (state === "unsupported") {
    return compact ? null : (
      <p className="text-xs text-zinc-500">Браузер не поддерживает push-уведомления.</p>
    );
  }

  if (state === "enabled") {
    return (
      <div className={compact ? "text-xs text-emerald-300" : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"}>
        Push-уведомления включены
        {message ? <div className="mt-1 text-xs text-emerald-300/80">{message}</div> : null}
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={compact ? "text-xs text-amber-300" : "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"}>
        Уведомления заблокированы в браузере
      </div>
    );
  }

  if (state === "disabled") {
    return (
      <div className={compact ? "text-xs text-zinc-500" : "rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400"}>
        {message ?? "Push пока не настроен"}
      </div>
    );
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"}>
      {!compact ? (
        <p className="text-xs text-zinc-500">
          На iPhone/Android: «Поделиться» → «На экран Домой», затем включите push.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void enablePush()}
        className={
          compact
            ? "mt-2 w-full rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100"
            : "mt-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
        }
      >
        Включить push-уведомления
      </button>
      {message ? <p className="mt-2 text-xs text-rose-300">{message}</p> : null}
    </div>
  );
}
