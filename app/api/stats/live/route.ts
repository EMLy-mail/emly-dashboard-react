import type { NextRequest } from "next/server";
import { getCurrentUser, getSessionToken } from "@/lib/auth";
import { defaultStatsProduct, statsProductFilters } from "@/lib/products";
import { getStatsHub } from "@/lib/realtime/stats-hub";

// In-domain fan-out only: the WebSocket to the API lives in a stats hub, one
// per session and product filter in this Next.js process, and this route just
// relays what it already has to every open tab of that session. Needs the module-level singleton and a long-lived response, so
// neither the Edge runtime nor any caching applies.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: NextRequest) {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) return jsonError(401, "unauthorized");

  // Checked here too so a hand-written URL cannot open a socket the API
  // would only refuse.
  const product = request.nextUrl.searchParams.get("product") || defaultStatsProduct(user);
  if (!statsProductFilters(user).includes(product)) {
    return jsonError(403, "product not assigned to this user");
  }

  const statsHub = getStatsHub(token, product);

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onSummary: (summary: unknown) => void;
  let onClients: (clients: unknown) => void;
  let onEvents: (events: unknown) => void;
  let onStatus: (status: string) => void;

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone) between the hub event
          // firing and this write - cancel() below detaches the listeners,
          // this is just the last straggler.
        }
      };

      write("retry: 3000\n\n");

      const summary = statsHub.getSummarySnapshot();
      if (summary) write(sseFrame("stats-summary", summary));
      const clients = statsHub.getClientsSnapshot();
      if (clients) write(sseFrame("stats-clients", clients));
      const events = statsHub.getEventsSnapshot();
      if (events) write(sseFrame("stats-events", events));
      write(sseFrame("stats-status", { live: statsHub.status() === "open" }));

      onSummary = (data) => write(sseFrame("stats-summary", data));
      onClients = (data) => write(sseFrame("stats-clients", data));
      onEvents = (data) => write(sseFrame("stats-events", data));
      onStatus = (status: string) => write(sseFrame("stats-status", { live: status === "open" }));

      statsHub.on("summary", onSummary);
      statsHub.on("clients", onClients);
      statsHub.on("events", onEvents);
      statsHub.on("status", onStatus);

      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    },
    cancel() {
      // Fires when the client disconnects (tab closed, EventSource
      // reconnecting) - detach every listener or they leak on the
      // process-wide hub for as long as the process runs.
      if (heartbeat) clearInterval(heartbeat);
      statsHub.off("summary", onSummary);
      statsHub.off("clients", onClients);
      statsHub.off("events", onEvents);
      statsHub.off("status", onStatus);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/reverse-proxy buffering of the stream
    },
  });
}
