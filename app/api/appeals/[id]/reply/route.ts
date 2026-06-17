import { auth } from "@/auth";
import { addOperatorReply, closeAppeal, getAppeal } from "@/lib/appeals";
import { sendMaxMessage } from "@/lib/max-bot";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    close?: boolean;
  };
  const text = body.text?.trim();
  if (!text) {
    return Response.json({ error: "Текст ответа обязателен" }, { status: 400 });
  }

  const { id } = await params;
  const appeal = await getAppeal(id);
  if (!appeal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!appeal.maxChatId) {
    return Response.json({ error: "У обращения нет MAX chat_id" }, { status: 400 });
  }

  const message = `Ответ по обращению №${appeal.appealNumber}: ${text}`;
  await sendMaxMessage(appeal.maxChatId, message);
  await addOperatorReply(id, text);

  const updated = body.close
    ? await closeAppeal(id, text)
    : await getAppeal(id);

  return Response.json({ appeal: updated });
}
