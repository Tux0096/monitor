import { DashboardClient } from "./dashboard-client";
import { getMonitorSnapshot } from "@/lib/monitor/store";

export default function DashboardPage() {
  const initial = getMonitorSnapshot();
  return <DashboardClient initial={initial} />;
}
