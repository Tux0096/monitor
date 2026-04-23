import { auth } from "@/auth";
import { getMonitorSnapshot, subscribeMonitor } from "@/lib/monitor/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          const snap = getMonitorSnapshot();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snap)}\n\n`),
          );
        } catch {
          /* stream closed */
        }
      };
      send();
      unsub = subscribeMonitor(send);
      intervalId = setInterval(send, 12_000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
      unsub?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
