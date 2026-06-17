import { readFile } from "node:fs/promises";

import { resolveAppealPhotoFile } from "@/lib/appeal-uploads";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { name } = await params;
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safeName) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const filePath = resolveAppealPhotoFile(safeName);
    const buffer = await readFile(filePath);
    const ext = safeName.split(".").pop()?.toLowerCase() ?? "jpg";
    return new Response(buffer, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
