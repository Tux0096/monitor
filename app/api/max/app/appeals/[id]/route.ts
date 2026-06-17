import {
  addCourierMiniAppAppealMessage,
  getCourierMiniAppAppealDetail,
  getCourierProfileByMaxOrPhone,
} from "@/lib/appeals";
import { appealPhotoPublicPath, saveAppealPhoto } from "@/lib/appeal-uploads";
import { miniAppError, parseMiniAppRequest } from "@/lib/max-app-api";
import { validateMaxInitData } from "@/lib/max-webapp";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const initData = new URL(request.url).searchParams.get("initData")?.trim() ?? "";
  const parsed = validateMaxInitData(initData);
  if (!parsed) return miniAppError("Недействительная сессия MAX", 401);

  const maxUserId = String(parsed.user.id);
  const profile = await getCourierProfileByMaxOrPhone(maxUserId);
  const appeal = await getCourierMiniAppAppealDetail(maxUserId, id, profile?.phone);
  if (!appeal) return miniAppError("Обращение не найдено", 404);

  return Response.json({ appeal });
}

export async function POST(request: Request, { params }: Params) {
  const payload = await parseMiniAppRequest(request);
  if (!payload) return miniAppError("Недействительная сессия MAX", 401);

  const { id } = await params;
  const text = typeof payload.body.text === "string" ? payload.body.text : "";
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
  const maxUserId = String(user.id);
  const chatId = chat?.id != null ? String(chat.id) : maxUserId;
  const profile = await getCourierProfileByMaxOrPhone(maxUserId);

  try {
    const appeal = await addCourierMiniAppAppealMessage({
      maxUserId,
      appealId: id,
      chatId,
      phone: profile?.phone,
      text,
      photoUrl,
    });
    if (!appeal) return miniAppError("Обращение не найдено", 404);
    return Response.json({ appeal });
  } catch (error) {
    return miniAppError(error instanceof Error ? error.message : "Не удалось отправить сообщение");
  }
}
