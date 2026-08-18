import { auth } from "@/auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

const DEFAULT_CABINET_URL = "http://127.0.0.1:3106";

/**
 * Прокси дашборд → админ-API кабинета.
 *
 * Сессию администратора проверяем здесь, а сервису передаём service secret
 * и email. Так у кабинета не появляется второй логин: администратор уже
 * вошёл в дашборд, требовать пароль ещё раз незачем.
 *
 * Email прокидывается для журнала: в cab_admin_audit должно быть видно,
 * кто именно подтвердил заявку или опубликовал новость.
 */
async function proxy(request: Request, path: string[]): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = getRuntimeEnv("CABINET_SERVICE_URL")?.trim() || DEFAULT_CABINET_URL;
  const secret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  if (!secret) {
    return Response.json(
      { code: "no_secret", detail: "PERFORMANCE_IMPORT_SECRET не задан" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const headers = new Headers({
    "x-monitor-import-secret": secret,
    "x-monitor-user-email": session.user.email ?? "admin",
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let body: string | undefined;
  if (request.method !== "GET") body = await request.text();

  try {
    const upstream = await fetch(`${base}/admin/${path.join("/")}${url.search}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[cabinet-admin] сервис недоступен:",
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      { code: "service_unavailable", detail: "Сервис кабинета не отвечает" },
      { status: 503 },
    );
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await ctx.params).path);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await ctx.params).path);
}
