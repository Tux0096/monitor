import type { MonitorSnapshot } from "@/lib/types";

const empty: MonitorSnapshot = { results: [] };

type MonitorGlobal = typeof globalThis & {
  __fuji_monitor_state?: {
    snapshot: MonitorSnapshot;
    listeners: Set<(s: MonitorSnapshot) => void>;
  };
};

function getState() {
  const g = globalThis as MonitorGlobal;
  if (!g.__fuji_monitor_state) {
    g.__fuji_monitor_state = {
      snapshot: empty,
      listeners: new Set(),
    };
  }
  return g.__fuji_monitor_state;
}

export function getMonitorSnapshot(): MonitorSnapshot {
  return getState().snapshot;
}

export function setMonitorSnapshot(next: MonitorSnapshot): void {
  const st = getState();
  st.snapshot = next;
  for (const fn of st.listeners) fn(next);
}

export function subscribeMonitor(fn: (s: MonitorSnapshot) => void): () => void {
  const st = getState();
  st.listeners.add(fn);
  return () => st.listeners.delete(fn);
}
