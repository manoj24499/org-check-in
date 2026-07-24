import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { locationEvents, type LocationUpdate } from "@/lib/locationEvents";

export const dynamic = "force-dynamic";

// Server-Sent Events stream so the admin dashboard's Live Location column
// updates in real time — no polling, no page refresh.
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let listener: (update: LocationUpdate) => void = () => {};
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));

      listener = (update) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
      };
      locationEvents.on("update", listener);

      // Comment-only keep-alive pings so intermediary proxies don't time out the connection.
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        locationEvents.off("update", listener);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      clearInterval(keepAlive);
      locationEvents.off("update", listener);
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
