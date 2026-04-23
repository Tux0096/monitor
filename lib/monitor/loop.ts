import { loadAllTargets } from "@/lib/targets";
import { getMonitorSnapshot, setMonitorSnapshot } from "@/lib/monitor/store";
import { runAllChecks } from "@/lib/monitor/runner";

const INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS) || 30_000;

declare global {
  // eslint-disable-next-line no-var
  var __fuji_monitor_started: boolean | undefined;
}

async function tick(): Promise<void> {
  const prev = getMonitorSnapshot();
  try {
    const { targets } = await loadAllTargets();

    setMonitorSnapshot({
      ...prev,
      results: targets.map((t) => ({
        id: t.id,
        name: t.name,
        url: t.url,
        status: "checking" as const,
        checkedAt: new Date().toISOString(),
      })),
      lastError: undefined,
    });

    const results = await runAllChecks(targets);
    setMonitorSnapshot({
      results,
      meta: {
        intervalMs: INTERVAL_MS,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const cur = getMonitorSnapshot();
    setMonitorSnapshot({
      results: cur.results,
      meta: cur.meta,
      lastError: msg,
    });
  }
}

export async function startMonitorLoop(): Promise<void> {
  if (globalThis.__fuji_monitor_started) return;
  globalThis.__fuji_monitor_started = true;

  await tick();
  setInterval(() => {
    void tick();
  }, INTERVAL_MS);
}
