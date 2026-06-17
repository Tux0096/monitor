import { validateMaxInitData } from "@/lib/max-webapp";

export async function parseMiniAppRequest(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const initData = typeof body?.initData === "string" ? body.initData.trim() : "";
  const parsed = validateMaxInitData(initData);
  if (!parsed) return null;
  return { parsed, body: body ?? {} };
}

export function miniAppError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
