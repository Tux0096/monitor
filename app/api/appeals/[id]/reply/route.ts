import { auth } from "@/auth";
import { closeAppeal, getAppeal, sendOperatorReplyToAppealChat } from "@/lib/appeals";

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
    return Response.json({ error: "У обращения нет chat_id для ответа в мессенджер" }, { status: 400 });
  }

  try {
    await sendOperatorReplyToAppealChat(id, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
    return Response.json({ error: message }, { status: 502 });
  }

  const updated = body.close ? await closeAppeal(id, text) : await getAppeal(id);

  return Response.json({ appeal: updated });
}
