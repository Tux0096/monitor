import { google } from "googleapis";
import { access } from "node:fs/promises";
import { getPublicAppUrl } from "./config.js";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

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
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  const projectId = process.env.PUSH_FIREBASE_PROJECT_ID?.trim();
  const accessToken = await getPushFcmAccessToken();
  const defaultUrl = getPublicAppUrl() + "/dashboard";

  if (!projectId) {
    return {
      sent: 0,
      failed: tokens.length,
      errors: ["PUSH_FIREBASE_PROJECT_ID не задан"],
    };
  }

  if (!accessToken) {
    return {
      sent: 0,
      failed: tokens.length,
      errors: [
        "FCM: нет service account push-проекта (PUSH_GOOGLE_SERVICE_ACCOUNT_FILE)",
      ],
    };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      },
    );

    if (response.ok) {
      sent += 1;
      continue;
    }

    failed += 1;
    const text = await response.text().catch(() => "");
    errors.push(
      `${token.slice(0, 12)}…: ${response.status} ${text.slice(0, 120)}`,
    );
  }

  return { sent, failed, errors };
}
