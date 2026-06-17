import { auth } from "@/auth";
import { listCourierProfiles } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const couriers = await listCourierProfiles(search);
  return Response.json({ couriers });
}
