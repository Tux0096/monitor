import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ENV_KEYS = new Set([
  "PERFORMANCE_IMPORT_SECRET",
  "MAX_BOT_TOKEN",
  "MAX_BOT_WEBHOOK_SECRET",
  "MAX_BOT_ADMIN_SECRET",
  "MAX_BOT_USER_ID",
  "MAX_SUPPORT_CHAT_IDS",
  "LOCAL_AI_URL",
  "LOCAL_AI_MODEL",
  "LOCAL_AI_VISION_MODEL",
  "MONITOR_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_PASSWORD",
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
  if (!ENV_KEYS.has(name)) {
    return process.env[name]?.trim().replace(/\r$/, "") || undefined;
  }

  const fromProcess = process.env[name]?.trim().replace(/\r$/, "");
  if (fromProcess) {
    return fromProcess;
  }

  return loadEnvFile().get(name)?.trim().replace(/\r$/, "") || undefined;
}
