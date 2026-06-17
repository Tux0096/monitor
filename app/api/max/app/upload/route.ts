import { readFile } from "node:fs/promises";

import { appealPhotoPublicPath, resolveAppealPhotoFile, saveAppealPhoto } from "@/lib/appeal-uploads";
import { miniAppError, parseMiniAppRequest } from "@/lib/max-app-api";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function POST(request: Request) {
  const payload = await parseMiniAppRequest(request);
  if (!payload) return miniAppError("Недействительная сессия MAX", 401);

  const photoData = typeof payload.body.photoData === "string" ? payload.body.photoData : "";
  if (!photoData.startsWith("data:image/")) {
    return miniAppError("Выберите изображение");
  }

  try {
    const fileName = await saveAppealPhoto(photoData);
    const origin = new URL(request.url).origin;
    return Response.json({ url: `${origin}${appealPhotoPublicPath(fileName)}` });
  } catch (error) {
    return miniAppError(error instanceof Error ? error.message : "Не удалось загрузить фото");
  }
}
