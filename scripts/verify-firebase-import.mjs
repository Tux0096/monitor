/**
 * Проверка доступа к Firebase Performance / BigQuery и пробный импорт.
 * Запуск на сервере: node scripts/verify-firebase-import.mjs
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync("/opt/monitor/.env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const port = env.MONITOR_PORT || "3080";
const secret = env.PERFORMANCE_IMPORT_SECRET;

console.log("=== secrets on disk ===");
for (const p of [
  env.GOOGLE_SERVICE_ACCOUNT_FILE,
  env.GOOGLE_OAUTH_TOKEN_FILE,
  "/opt/monitor/secrets/firebase-sa.json",
  "/opt/monitor/secrets/google-oauth.json",
]) {
  if (!p) continue;
  console.log(p, fs.existsSync(p) ? "OK" : "MISSING");
}

console.log("\n=== env lengths ===");
for (const k of [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "FIREBASE_PROJECT_ID",
]) {
  console.log(k, (env[k] || "").length);
}

if (!secret) {
  console.error("\nPERFORMANCE_IMPORT_SECRET missing");
  process.exit(1);
}

const url = `http://127.0.0.1:${port}/api/firebase/performance/import?from=2026-06-17&to=2026-06-23&force=1`;
const response = await fetch(url, {
  method: "POST",
  headers: { "x-monitor-import-secret": secret },
});
const body = await response.json();
console.log("\n=== import result ===");
console.log(JSON.stringify(body, null, 2));

process.exit(body.firebaseSkipped ? 2 : 0);
