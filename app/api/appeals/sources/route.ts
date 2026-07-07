import { auth } from "@/auth";
import { listAppealIntakeSources } from "@/lib/appeal-intake-sources";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ sources: listAppealIntakeSources() });
}
