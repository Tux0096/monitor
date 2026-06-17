import { auth } from "@/auth";
import { listMergeCandidates } from "@/lib/appeals";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const candidates = await listMergeCandidates(id);
  return Response.json({ candidates });
}
