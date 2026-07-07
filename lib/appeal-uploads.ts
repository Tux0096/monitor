import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LOCAL_PHOTO_PREFIX = "/api/max/app/photos/";

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
  return `${LOCAL_PHOTO_PREFIX}${fileName}`;
}

export function isLocalAppealPhotoPath(photoUrl: string) {
  const trimmed = photoUrl.trim();
  if (trimmed.startsWith(LOCAL_PHOTO_PREFIX)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.startsWith(LOCAL_PHOTO_PREFIX);
  } catch {
    return false;
  }
}

function localAppealPhotoFileName(photoUrl: string) {
  const trimmed = photoUrl.trim();
  if (trimmed.startsWith(LOCAL_PHOTO_PREFIX)) {
    return trimmed.slice(LOCAL_PHOTO_PREFIX.length);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith(LOCAL_PHOTO_PREFIX)) {
      return parsed.pathname.slice(LOCAL_PHOTO_PREFIX.length);
    }
  } catch {
    // not a URL
  }
  return null;
}

export function resolveLocalAppealPhotoPath(photoUrl: string) {
  const fileName = localAppealPhotoFileName(photoUrl);
  return fileName ? resolveAppealPhotoFile(fileName) : null;
}

async function saveAppealPhotoBuffer(buffer: Buffer, extension: string) {
  if (buffer.length < 32) {
    throw new Error("Image is too small");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image is too large");
  }

  const safeExtension = extension.match(/^(jpg|jpeg|png|webp|gif)$/i) ? extension.toLowerCase() : "jpg";
  const fileName = `${randomUUID()}.${safeExtension === "jpeg" ? "jpg" : safeExtension}`;
  const dir = await uploadDir();
  await writeFile(join(dir, fileName), buffer);
  return appealPhotoPublicPath(fileName);
}

export async function saveAppealPhotoFromUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed || isLocalAppealPhotoPath(trimmed)) {
    return isLocalAppealPhotoPath(trimmed) ? trimmed : null;
  }

  try {
    const response = await fetch(trimmed, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    let extension = "jpg";
    if (contentType === "image/png") extension = "png";
    else if (contentType === "image/webp") extension = "webp";
    else if (contentType === "image/gif") extension = "gif";

    return saveAppealPhotoBuffer(buffer, extension);
  } catch {
    return null;
  }
}

export async function persistAppealPhotoUrl(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl?.trim()) return null;
  const trimmed = photoUrl.trim();
  if (isLocalAppealPhotoPath(trimmed)) return trimmed;
  if (trimmed.startsWith("data:image/")) {
    try {
      const fileName = await saveAppealPhoto(trimmed);
      return appealPhotoPublicPath(fileName);
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return saveAppealPhotoFromUrl(trimmed);
  }
  return null;
}

export function resolveAppealPhotoFile(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
  for (const dir of UPLOAD_DIRS) {
    const fullPath = join(dir, safeName);
    if (fullPath.startsWith(dir)) return fullPath;
  }
  return join(UPLOAD_DIRS[0], safeName);
}
