import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getGoogleOAuthCredentials } from "@/lib/google-oauth-store";
import { access } from "node:fs/promises";

const GOOGLE_API_SCOPES = [
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform.read-only",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export type GoogleAuthSource = "service_account" | "user_oauth" | "none";

export type ResolvedGoogleAuth = {
  auth: OAuth2Client | Awaited<ReturnType<typeof google.auth.GoogleAuth.prototype.getClient>>;
  source: GoogleAuthSource;
};

function parseServiceAccountJson(): object | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as object;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON: невалидный JSON");
  }
}

/** Серверный ключ Firebase (service account) или OAuth-токен пользователя после входа через Google. */
export async function resolveGoogleApiAuth(
  userAccessToken?: string,
): Promise<ResolvedGoogleAuth | { auth: null; source: "none" }> {
  const credentials = parseServiceAccountJson();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  const { clientId, clientSecret, refreshToken } =
    await getGoogleOAuthCredentials();

  const existingKeyFile = keyFile ? await fileExists(keyFile) : false;

  if (credentials || existingKeyFile) {
    const googleAuth = new google.auth.GoogleAuth({
      ...(credentials ? { credentials } : { keyFile: keyFile! }),
      scopes: GOOGLE_API_SCOPES,
    });
    const client = await googleAuth.getClient();
    return { auth: client, source: "service_account" };
  }

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return { auth: oauth2, source: "user_oauth" };
  }

  if (userAccessToken) {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: userAccessToken });
    return { auth: oauth2, source: "user_oauth" };
  }

  return { auth: null, source: "none" };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
