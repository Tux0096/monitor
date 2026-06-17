import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIRS = ["/opt/monitor/uploads/appeals", join(/* turbopackIgnore: true */ process.cwd(), "data", "uploads", "appeals")];

async function uploadDir() {
  for (const dir of UPLOAD_DIRS) {
    try {
      await mkdir(dir, { recursive: true });
      return dir;
    } catch {
      // try next path
    }
  }
  throw new Error("Upload directory is not writable");
}

function extensionForMime(mime: string) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export async function saveAppealPhoto(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("Invalid image payload");
  }

  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 32) {
    throw new Error("Image is too small");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image is too large");
  }

  const fileName = `${randomUUID()}.${extensionForMime(mime.toLowerCase())}`;
  const dir = await uploadDir();
  await writeFile(join(dir, fileName), buffer);
  return fileName;
}

export function appealPhotoPublicPath(fileName: string) {
  return `/api/max/app/photos/${fileName}`;
}

export function resolveAppealPhotoFile(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
  for (const dir of UPLOAD_DIRS) {
    const fullPath = join(dir, safeName);
    if (fullPath.startsWith(dir)) return fullPath;
  }
  return join(UPLOAD_DIRS[0], safeName);
}
