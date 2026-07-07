import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ENV_KEYS = new Set([
  "PERFORMANCE_IMPORT_SECRET",
  "MAX_BOT_TOKEN",
  "MAX_BOT_WEBHOOK_SECRET",
  "MAX_BOT_ADMIN_SECRET",
  "MAX_BOT_USER_ID",
  "MAX_SUPPORT_CHAT_IDS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_WEBHOOK_SECRET",
  "TELEGRAM_BOT_ADMIN_SECRET",
  "TELEGRAM_BOT_WEBHOOK_URL",
  "TELEGRAM_SUPPORT_CHAT_IDS",
  "TELEGRAM_IT_TOPIC_IDS",
  "TELEGRAM_IT_TOPIC_NAMES",
  "TELEGRAM_API_IP",
  "LOCAL_AI_URL",
  "LOCAL_AI_MODEL",
  "LOCAL_AI_VISION_MODEL",
  "MONITOR_DATABASE_URL",
  "PUSH_SERVICE_URL",
  "AUTH_SECRET",
  "AUTH_PASSWORD",
  "FIREBASE_PROJECT_ID",
  "PUSH_FIREBASE_PROJECT_ID",
  "PUSH_GOOGLE_SERVICE_ACCOUNT_FILE",
  "PUSH_GOOGLE_SERVICE_ACCOUNT_JSON",
  "NEXT_PUBLIC_PUSH_FIREBASE_API_KEY",
  "NEXT_PUBLIC_PUSH_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_PUSH_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_PUSH_FIREBASE_APP_ID",
  "NEXT_PUBLIC_PUSH_FIREBASE_VAPID_KEY",
  "GOOGLE_SERVICE_ACCOUNT_FILE",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_OAUTH_TOKEN_FILE",
  "PAGESPEED_API_KEY",
  "PAGESPEED_SITE_URL",
  "BIGQUERY_LOCATION",
]);

let fileCache: Map<string, string> | null = null;

function envFileCandidates(): string[] {
  const cwd = process.cwd();
  return [
    process.env.MONITOR_ENV_FILE?.trim(),
    path.join(cwd, ".env.local"),
    path.join(cwd, "..", ".env.local"),
    path.join(cwd, "..", "..", ".env.local"),
    "/opt/monitor/.env.local",
  ].filter((value): value is string => Boolean(value));
}

function loadEnvFile(): Map<string, string> {
  if (fileCache) {
    return fileCache;
  }

  const values = new Map<string, string>();
  for (const filePath of envFileCandidates()) {
    if (!existsSync(filePath)) {
      continue;
    }
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/\r$/, "");
      if (!values.has(key)) {
        values.set(key, value);
      }
    }
    break;
  }

  fileCache = values;
  return values;
}

export function getRuntimeEnv(name: string): string | undefined {
  if (ENV_KEYS.has(name)) {
    const fromFile = loadEnvFile().get(name)?.trim().replace(/\r$/, "");
    if (fromFile) {
      return fromFile;
    }
    return process.env[name]?.trim().replace(/\r$/, "") || undefined;
  }

  return process.env[name]?.trim().replace(/\r$/, "") || undefined;
}
