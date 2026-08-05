import { getRuntimeEnv } from "@/lib/runtime-env";

const DEFAULT_PUSH_SERVICE_URL = "http://127.0.0.1:3103";

function pushServiceBaseUrl(): string {
  return getRuntimeEnv("PUSH_SERVICE_URL")?.trim() || DEFAULT_PUSH_SERVICE_URL;
}

function serviceHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const secret = getRuntimeEnv("PERFORMANCE_IMPORT_SECRET");
  if (secret) {
    headers.set("x-monitor-import-secret", secret);
  }
  return headers;
}

export async function pushServiceFetch(
  path: string,
  init: RequestInit & { userEmail?: string } = {},
): Promise<Response> {
  const headers = serviceHeaders(init.headers);
  if (init.userEmail) {
    headers.set("x-monitor-user-email", init.userEmail);
  }

  const { userEmail, ...fetchInit } = init;

  return fetch(`${pushServiceBaseUrl()}${path}`, {
    ...fetchInit,
    headers,
    cache: "no-store",
  });
}

export async function proxyPushJson(
  path: string,
  init: RequestInit & { userEmail?: string } = {},
): Promise<Response> {
  const upstream = await pushServiceFetch(path, init);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function proxyPushJavaScript(path: string): Promise<Response> {
  const upstream = await pushServiceFetch(path);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ??
        "application/javascript; charset=utf-8",
      "Cache-Control": upstream.headers.get("Cache-Control") ?? "no-cache",
      "Service-Worker-Allowed":
        upstream.headers.get("Service-Worker-Allowed") ?? "/",
    },
  });
}

export async function notifyPushService(body: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  domain?: "dashboard" | "appeals" | "appeals_report" | "courier_report";
  cooldownMinutes?: number;
  dedupeKey?: string;
}): Promise<void> {
  // Отправка best-effort — ошибка push не должна ронять основной сценарий.
  // Но молча глотать её нельзя: именно из-за этого «пуши не приходят»
  // раньше невозможно было диагностировать.
  try {
    const response = await pushServiceFetch("/push/v1/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[push] notify failed: ${response.status} ${text.slice(0, 300)}`,
        { domain: body.domain, dedupeKey: body.dedupeKey },
      );
      return;
    }

    const result = (await response.json().catch(() => null)) as {
      sent?: number;
      failed?: number;
      pruned?: number;
      tokens?: number;
      skipped?: boolean;
      errors?: string[];
    } | null;

    if (result && !result.skipped && (result.failed ?? 0) > 0) {
      console.warn(
        `[push] notify: доставлено ${result.sent ?? 0}/${result.tokens ?? 0}, ` +
          `ошибок ${result.failed}, удалено протухших ${result.pruned ?? 0}`,
        result.errors?.slice(0, 3),
      );
    }
  } catch (error) {
    console.error(
      "[push] notify недоступен:",
      error instanceof Error ? error.message : error,
      { domain: body.domain, dedupeKey: body.dedupeKey },
    );
  }
}
