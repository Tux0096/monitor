import { readFile } from "fs/promises";
import path from "path";
import type { MonitorTarget } from "@/lib/types";

type FileConfig = { targets: MonitorTarget[] };

async function loadFileTargets(): Promise<MonitorTarget[]> {
  const fp = path.join(process.cwd(), "config", "targets.json");
  const raw = await readFile(fp, "utf-8");
  const data = JSON.parse(raw) as FileConfig;
  return (data.targets ?? []).map((t) => ({
    ...t,
    source: "file" as const,
  }));
}

export type LoadedTargets = {
  targets: MonitorTarget[];
};

export async function loadAllTargets(): Promise<LoadedTargets> {
  const targets = await loadFileTargets();
  return { targets };
}
