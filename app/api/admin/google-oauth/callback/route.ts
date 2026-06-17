import { auth } from "@/auth";
import {
  getGoogleOAuthCredentials,
  writeStoredGoogleOAuth,
} from "@/lib/google-oauth-store";
import { google } from "googleapis";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return redirectWithStatus(origin, "error", error);
  }

  const session = await auth();
  if (session?.user?.role !== "admin") {
    return redirectWithStatus(origin, "error", "unauthorized");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus(origin, "error", "invalid_state");
  }

  const { clientId, clientSecret } = await getGoogleOAuthCredentials();
  if (!clientId || !clientSecret) {
    return redirectWithStatus(origin, "error", "missing_google_oauth_client");
  }

  const redirectUri = `${origin}/api/admin/google-oauth/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data } = await oauth2Api.userinfo.get();
  if (data.email !== "a.imukov@fuji.ru") {
    return redirectWithStatus(origin, "error", "wrong_google_account");
  }
  if (!tokens.refresh_token) {
    return redirectWithStatus(origin, "error", "missing_refresh_token");
  }

  await writeStoredGoogleOAuth({
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
    email: data.email,
  });

  return redirectWithStatus(origin, "connected", data.email);
}

function redirectWithStatus(origin: string, status: string, value: string) {
  const redirect = new URL("/dashboard", origin);
  redirect.searchParams.set("firebaseOAuth", status);
  redirect.searchParams.set("googleAccount", value);
  return Response.redirect(redirect);
}
