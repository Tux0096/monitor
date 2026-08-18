import { getRuntimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";

const DEFAULT_CABINET_URL = "http://127.0.0.1:3106";

/**
 * Прокси Mini App → cabinet-service.
 *
 * Кабинет ходит на тот же домен, что и сам открыт: нет preflight,
 * нет разбирательств с origin `capacitor://localhost` и `web.telegram.org`.
 * Сервис при этом остаётся закрытым на 127.0.0.1.
 *
 * Авторизация не проверяется здесь намеренно — это делает сервис.
 * Прокси не должен знать про токены кабинета.
 */
async function proxy(request: Request, path: string[]): Promise<Response> {
  const base = getRuntimeEnv("CABINET_SERVICE_URL")?.trim() || DEFAULT_CABINET_URL;
  const url = new URL(request.url);
  const target = `${base}/api/v1/${path.join("/")}${url.search}`;

  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Пробрасываем реальный адрес: rate-limit сервиса иначе увидит
  // один IP прокси на всех пользователей и заблокирует всех разом.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) headers.set("x-forwarded-for", forwarded);

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  try {
    const upstream = await fetch(target, {
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
      "[cabinet-proxy] сервис недоступен:",
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
