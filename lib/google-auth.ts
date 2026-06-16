import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

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

  if (credentials || keyFile) {
    const googleAuth = new google.auth.GoogleAuth({
      ...(credentials ? { credentials } : { keyFile }),
      scopes: GOOGLE_API_SCOPES,
    });
    const client = await googleAuth.getClient();
    return { auth: client, source: "service_account" };
  }

  if (userAccessToken) {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: userAccessToken });
    return { auth: oauth2, source: "user_oauth" };
  }

  return { auth: null, source: "none" };
}
