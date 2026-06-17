import {
  createCourierAppealFromMiniApp,
  getCourierMiniAppBootstrap,
} from "@/lib/appeals";
import { appealPhotoPublicPath, saveAppealPhoto } from "@/lib/appeal-uploads";
import { miniAppError, parseMiniAppRequest } from "@/lib/max-app-api";
import { formatMaxUserName } from "@/lib/max-webapp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const initData = new URL(request.url).searchParams.get("initData")?.trim() ?? "";
  const parsed = (await import("@/lib/max-webapp")).validateMaxInitData(initData);
  if (!parsed) return miniAppError("Недействительная сессия MAX", 401);

  const bootstrap = await getCourierMiniAppBootstrap(
    String(parsed.user.id),
    formatMaxUserName(parsed.user),
    parsed.user.last_name ?? null,
  );
  return Response.json({ appeals: bootstrap.appeals });
}

export async function POST(request: Request) {
  const payload = await parseMiniAppRequest(request);
  if (!payload) return miniAppError("Недействительная сессия MAX", 401);

  const description = typeof payload.body.description === "string" ? payload.body.description : "";
  const phoneModel = typeof payload.body.phoneModel === "string" ? payload.body.phoneModel : "";
  const os = typeof payload.body.os === "string" ? payload.body.os : "";
  const appVersion = typeof payload.body.appVersion === "string" ? payload.body.appVersion : "";
  let photoUrl = typeof payload.body.photoUrl === "string" ? payload.body.photoUrl : null;

  if (typeof payload.body.photoData === "string" && payload.body.photoData.startsWith("data:image/")) {
    try {
      const fileName = await saveAppealPhoto(payload.body.photoData);
      const origin = new URL(request.url).origin;
      photoUrl = `${origin}${appealPhotoPublicPath(fileName)}`;
    } catch (error) {
      return miniAppError(error instanceof Error ? error.message : "Не удалось сохранить фото");
    }
  }

  const { user, chat } = payload.parsed;
  const chatId = chat?.id != null ? String(chat.id) : String(user.id);

  try {
    const result = await createCourierAppealFromMiniApp({
      maxUserId: String(user.id),
      chatId,
      senderName: formatMaxUserName(user),
      description,
      photoUrl,
      phoneModel,
      os,
      appVersion,
    });
    return Response.json(result);
  } catch (error) {
    return miniAppError(error instanceof Error ? error.message : "Не удалось создать обращение");
  }
}
