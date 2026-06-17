import { bindCourierPhoneFromMiniApp } from "@/lib/appeals";
import { miniAppError, parseMiniAppRequest } from "@/lib/max-app-api";
import { formatMaxUserName, validateMaxContactPhone } from "@/lib/max-webapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await parseMiniAppRequest(request);
  if (!payload) return miniAppError("Недействительная сессия MAX", 401);

  const phone = typeof payload.body.phone === "string" ? payload.body.phone.trim() : "";
  const authDate = typeof payload.body.authDate === "string" ? payload.body.authDate : "";
  const hash = typeof payload.body.hash === "string" ? payload.body.hash : "";
  if (!phone || !authDate || !hash) {
    return miniAppError("Не удалось получить номер телефона");
  }

  const { user } = payload.parsed;
  if (
    !validateMaxContactPhone({
      phone,
      authDate,
      hash,
      userId: user.id,
    })
  ) {
    return miniAppError("Номер телефона не подтверждён MAX", 403);
  }

  const bootstrap = await bindCourierPhoneFromMiniApp(
    String(user.id),
    phone,
    formatMaxUserName(user),
    user.last_name ?? null,
  );

  return Response.json(bootstrap);
}
