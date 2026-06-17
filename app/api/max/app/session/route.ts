import { getCourierMiniAppBootstrap } from "@/lib/appeals";
import { miniAppError, parseMiniAppRequest } from "@/lib/max-app-api";
import { formatMaxUserName } from "@/lib/max-webapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await parseMiniAppRequest(request);
  if (!payload) return miniAppError("Недействительная сессия MAX", 401);

  const { user } = payload.parsed;
  const maxUserId = String(user.id);
  const bootstrap = await getCourierMiniAppBootstrap(
    maxUserId,
    formatMaxUserName(user),
    user.last_name ?? null,
  );

  return Response.json(bootstrap);
}
