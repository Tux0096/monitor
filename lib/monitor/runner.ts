import type { CheckResult, MonitorTarget } from "@/lib/types";

const DEFAULT_EXPECT = [200, 204, 301, 302, 303, 307, 308];

export async function runOneCheck(t: MonitorTarget): Promise<CheckResult> {
  const expect = t.expectStatus ?? DEFAULT_EXPECT;
  const timeoutMs = t.timeoutMs ?? 15000;
  const start = Date.now();

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(t.url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "FujiResilienceMonitor/1.0 (+internal)",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(to);
    const latencyMs = Date.now() - start;
    const code = res.status;

    let status: CheckResult["status"];
    if (expect.includes(code)) status = "ok";
    else if (code >= 200 && code < 400) status = "ok";
    else if (code === 403 || code === 401) status = "degraded";
    else status = "down";

    return {
      id: t.id,
      name: t.name,
      url: t.url,
      status,
      httpStatus: code,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch (e: unknown) {
    const latencyMs = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    return {
      id: t.id,
      name: t.name,
      url: t.url,
      status: "down",
      latencyMs,
      error,
      checkedAt: new Date().toISOString(),
    };
  }
}

export function runAllChecks(targets: MonitorTarget[]): Promise<CheckResult[]> {
  return Promise.all(targets.map(runOneCheck));
}
