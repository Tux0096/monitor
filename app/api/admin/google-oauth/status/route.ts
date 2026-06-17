import { auth } from "@/auth";
import { getGoogleOAuthCredentials } from "@/lib/google-oauth-store";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, clientSecret, refreshToken, email, updatedAt } =
    await getGoogleOAuthCredentials();

  return Response.json({
    clientConfigured: Boolean(clientId && clientSecret),
    connected: Boolean(refreshToken),
    email: email ?? null,
    updatedAt: updatedAt ?? null,
  });
}
