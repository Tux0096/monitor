import { google } from "googleapis";
import { access } from "node:fs/promises";
import { getPublicAppUrl } from "./config.js";
import { removePushSubscription } from "./subscriptions.js";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_SEND_CONCURRENCY = 50;

type SendOutcome = {
  token: string;
  ok: boolean;
  /** Токен отозван или невалиден — подписку нужно удалить. */
  stale: boolean;
  error?: string;
};

/**
 * FCM отдаёт 404 UNREGISTERED, когда подписка отозвана (переустановка PWA,
 * очистка данных браузера, длительный простой), и 400 INVALID_ARGUMENT —
 * когда токен битый. В обоих случаях повторять отправку бессмысленно.
 */
function isStaleTokenResponse(status: number, responseText: string): boolean {
  if (status === 404) return true;
  if (status === 403) return false; // проблема доступа сервис-аккаунта, не токена
  if (status === 400) {
    return (
      responseText.includes("INVALID_ARGUMENT") ||
      responseText.includes("registration-token-not-registered")
    );
  }
  return false;
}

async function pruneStaleTokens(tokens: string[]): Promise<number> {
  let pruned = 0;
  for (const token of tokens) {
    try {
      await removePushSubscription(token);
      pruned += 1;
    } catch (error) {
      console.error(
        "[push] не удалось удалить протухший токен",
        token.slice(0, 12),
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (pruned > 0) {
    console.warn(`[push] удалено протухших подписок: ${pruned}`);
  }
  return pruned;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getPushFcmAccessToken(): Promise<string | null> {
  const credentialsJson = process.env.PUSH_GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const keyFile = process.env.PUSH_GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  let credentials: object | undefined;

  if (credentialsJson) {
    try {
      credentials = JSON.parse(credentialsJson) as object;
    } catch {
      return null;
    }
  } else if (keyFile && (await fileExists(keyFile))) {
    credentials = undefined;
  } else {
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : { keyFile: keyFile! }),
    scopes: [FCM_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token ?? null;
}

export async function sendFcmNotification(
  tokens: string[],
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ sent: number; failed: number; pruned: number; errors: string[] }> {
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, errors: [] };
  }

  const projectId = process.env.PUSH_FIREBASE_PROJECT_ID?.trim();
  const accessToken = await getPushFcmAccessToken();
  const defaultUrl = getPublicAppUrl() + "/dashboard";

  if (!projectId) {
    return {
      sent: 0,
      failed: tokens.length,
      pruned: 0,
      errors: ["PUSH_FIREBASE_PROJECT_ID не задан"],
    };
  }

  if (!accessToken) {
    return {
      sent: 0,
      failed: tokens.length,
      pruned: 0,
      errors: [
        "FCM: нет service account push-проекта (PUSH_GOOGLE_SERVICE_ACCOUNT_FILE)",
      ],
    };
  }

  const body = (token: string) =>
    JSON.stringify({
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        webpush: {
          fcmOptions: {
            link: payload.url ?? defaultUrl,
          },
          notification: {
            icon: "/icons/monitor-icon.svg",
            badge: "/icons/monitor-icon.svg",
            tag: payload.tag ?? "monitor-alert",
          },
        },
      },
    });

  const sendOne = async (token: string): Promise<SendOutcome> => {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: body(token),
        },
      );

      if (response.ok) return { token, ok: true, stale: false };

      const text = await response.text().catch(() => "");
      return {
        token,
        ok: false,
        stale: isStaleTokenResponse(response.status, text),
        error: `${token.slice(0, 12)}…: ${response.status} ${text.slice(0, 120)}`,
      };
    } catch (error) {
      return {
        token,
        ok: false,
        stale: false,
        error: `${token.slice(0, 12)}…: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const staleTokens: string[] = [];

  // Батчами, чтобы рассылка на сотни подписок не упиралась в таймаут cron-задачи.
  for (let i = 0; i < tokens.length; i += FCM_SEND_CONCURRENCY) {
    const batch = tokens.slice(i, i + FCM_SEND_CONCURRENCY);
    const outcomes = await Promise.all(batch.map(sendOne));

    for (const outcome of outcomes) {
      if (outcome.ok) {
        sent += 1;
        continue;
      }
      failed += 1;
      if (outcome.error) errors.push(outcome.error);
      if (outcome.stale) staleTokens.push(outcome.token);
    }
  }

  // Протухшие токены удаляем сразу: иначе они копятся навсегда и со временем
  // вытесняют живые подписки — рассылка внешне «работает», но никуда не доходит.
  let pruned = 0;
  if (staleTokens.length > 0) {
    pruned = await pruneStaleTokens(staleTokens);
  }

  return { sent, failed, pruned, errors };
}
