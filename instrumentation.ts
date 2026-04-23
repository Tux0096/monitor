export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startMonitorLoop } = await import("@/lib/monitor/loop");
  await startMonitorLoop();
}
