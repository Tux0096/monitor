import { auth } from "@/auth";
import { getMonitorSnapshot } from "@/lib/monitor/store";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(getMonitorSnapshot());
}
