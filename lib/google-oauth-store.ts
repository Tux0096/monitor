import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type StoredGoogleOAuth = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  email?: string;
  updatedAt?: string;
};

export function googleOAuthFilePath(): string {
  return getRuntimeEnv("GOOGLE_OAUTH_TOKEN_FILE") || "/opt/monitor/secrets/google-oauth.json";
}

export async function readStoredGoogleOAuth(): Promise<StoredGoogleOAuth> {
  try {
    const raw = await readFile(googleOAuthFilePath(), "utf8");
    return JSON.parse(raw) as StoredGoogleOAuth;
  } catch {
    return {};
  }
}

export async function writeStoredGoogleOAuth(
  patch: StoredGoogleOAuth,
): Promise<StoredGoogleOAuth> {
  const current = await readStoredGoogleOAuth();
  const next: StoredGoogleOAuth = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const file = googleOAuthFilePath();
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

export async function getGoogleOAuthCredentials() {
  const stored = await readStoredGoogleOAuth();
  return {
    clientId: getRuntimeEnv("GOOGLE_CLIENT_ID") || stored.clientId,
    clientSecret: getRuntimeEnv("GOOGLE_CLIENT_SECRET") || stored.clientSecret,
    refreshToken: getRuntimeEnv("GOOGLE_REFRESH_TOKEN") || stored.refreshToken,
    email: stored.email,
    updatedAt: stored.updatedAt,
  };
}
