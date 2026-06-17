import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getGoogleOAuthCredentials } from "@/lib/google-oauth-store";
import { google } from "googleapis";
import { cookies } from "next/headers";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform.read-only",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, clientSecret } = await getGoogleOAuthCredentials();
  if (!clientId || !clientSecret) {
    return Response.json(
      {
        error: "Google OAuth client is not configured on the server",
        hint:
          "Create /opt/monitor/secrets/google-oauth.json with clientId and clientSecret.",
      },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/admin/google-oauth/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    maxAge: 10 * 60,
    path: "/",
  });

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    login_hint: "a.imukov@fuji.ru",
    include_granted_scopes: true,
  });

  return Response.redirect(url);
}
