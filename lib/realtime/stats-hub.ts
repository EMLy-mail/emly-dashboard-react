import "server-only";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { env } from "@/lib/env";
import type { StatsEventsResponse, StatsSummary, UpdaterClient } from "@/lib/api";

// ── WS↔API wire protocol ────────────────────────────────────────────────────
// Mirrors docs/specs/2026-09-04-websocket-stats-realtime-api.md. This is the
// dashboard's only channel to the API for stats: everything the statistics
// page renders arrives here, so the page itself makes no REST calls once the
// hub is warm.

type ChannelName = "stats:summary" | "stats:clients" | "stats:events";

interface ServerEnvelope {
  type: "subscribed" | "snapshot" | "update" | "error" | "ping" | "pong";
  channel?: ChannelName;
  ts?: string;
  data?: unknown;
}

interface ClientsDelta {
  upserted?: UpdaterClient[];
  removed_ids?: number[];
}

const SUBSCRIBED_CHANNELS: ChannelName[] = ["stats:summary", "stats:clients", "stats:events"];
const WINDOW_MINUTES = 15;

// The events channel is subscribed once, at the day bucket and with no
// event_type filter: the API breaks its rows down by event_type anyway, so a
// single subscription feeds every event-type filter the chart offers and the
// dashboard narrows it client-side. An hour-bucket view is the one case this
// can't serve (the API keeps one events filter per connection, so a second
// bucket would mean a second connection) - that view falls back to the REST
// endpoint, see app/(dashboard)/statistics/page.tsx.
const EVENTS_BUCKET = "day";
const EVENTS_WINDOW_DAYS = 30;
// The API pins `from`/`to` per connection at subscribe time and only pushes
// events whose timestamp falls inside that window, so a connection left open
// would stop matching new events the moment it passed its own `to`. Ask for
// an hour of headroom and re-subscribe well inside it: that keeps the window
// rolling instead of drifting, and doubles as a periodic resync.
const EVENTS_TO_HEADROOM_MS = 60 * 60_000;
const EVENTS_RESUBSCRIBE_MS = 30 * 60_000;

const PING_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 90_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type StatsHubStatus = "disabled" | "connecting" | "open" | "reconnecting";

function wsUrlFromApiBaseUrl(apiBaseUrl: string): string {
  const url = new URL("/v2/stats/stream", apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Single long-lived WS connection to the API's stats stream, shared by every
 * browser tab via app/api/stats/live/route.ts. Never opened per-request -
 * see docs/specs/2026-09-04-websocket-stats-realtime-nextjs.md §2.
 */
class StatsHub extends EventEmitter {
  private ws: WebSocket | null = null;
  private started = false;
  private currentStatus: StatsHubStatus = "disabled";
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private resubscribeTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;

  private summarySnapshot: StatsSummary | null = null;
  private eventsSnapshot: StatsEventsResponse | null = null;
  private clientsById = new Map<number, UpdaterClient>();
  private clientsSnapshotReceived = false;

  /** Idempotent - safe to call from every incoming request. */
  ensureStarted(): void {
    if (this.started) return;
    this.started = true;

    if (!env.statsRealtimeEnabled) {
      this.setStatus("disabled");
      return;
    }

    this.connect();
  }

  status(): StatsHubStatus {
    return this.currentStatus;
  }

  getSummarySnapshot(): StatsSummary | null {
    return this.summarySnapshot;
  }

  getClientsSnapshot(): UpdaterClient[] | null {
    if (!this.clientsSnapshotReceived) return null;
    return Array.from(this.clientsById.values());
  }

  /** Day-bucketed, unfiltered by event_type - see EVENTS_BUCKET. */
  getEventsSnapshot(): StatsEventsResponse | null {
    return this.eventsSnapshot;
  }

  private setStatus(status: StatsHubStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.emit("status", status);
  }

  private connect(): void {
    this.setStatus(this.reconnectDelay === RECONNECT_MIN_MS ? "connecting" : "reconnecting");

    const headers: Record<string, string> = { "X-Admin-Key": env.adminKey };
    if (env.dashboardKey) headers["X-Dashboard-Key"] = env.dashboardKey;

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrlFromApiBaseUrl(env.apiBaseUrl), { headers });
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.on("open", () => {
      this.lastMessageAt = Date.now();
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.setStatus("open");
      this.subscribe();
      this.startTimers();
    });

    socket.on("message", (raw: WebSocket.RawData) => {
      this.lastMessageAt = Date.now();
      this.handleMessage(raw.toString());
    });

    socket.on("close", () => this.handleDisconnect());
    socket.on("error", () => {
      // "close" always follows "error" on ws - the reconnect happens there.
    });
  }

  /**
   * Sent on connect and again every EVENTS_RESUBSCRIBE_MS. Re-subscribing to
   * a channel already subscribed is how the API expects a client to move its
   * events window, and it answers with a fresh snapshot per channel.
   */
  private subscribe(): void {
    const now = Date.now();
    this.send({
      type: "subscribe",
      channels: SUBSCRIBED_CHANNELS,
      params: {
        window_minutes: WINDOW_MINUTES,
        events: {
          bucket: EVENTS_BUCKET,
          from: new Date(now - EVENTS_WINDOW_DAYS * 86_400_000).toISOString(),
          to: new Date(now + EVENTS_TO_HEADROOM_MS).toISOString(),
        },
      },
    });
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private startTimers(): void {
    this.stopTimers();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > STALE_AFTER_MS) {
        this.ws?.terminate();
        return;
      }
      this.send({ type: "ping" });
    }, PING_INTERVAL_MS);
    this.resubscribeTimer = setInterval(() => this.subscribe(), EVENTS_RESUBSCRIBE_MS);
  }

  private stopTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.resubscribeTimer) clearInterval(this.resubscribeTimer);
    this.resubscribeTimer = null;
  }

  private handleDisconnect(): void {
    this.stopTimers();
    this.ws = null;
    // Stale snapshots are worse than none: a client that fell offline while
    // we were disconnected would otherwise keep showing as online forever,
    // and page.tsx would serve that cache instead of falling back to REST.
    this.summarySnapshot = null;
    this.eventsSnapshot = null;
    this.clientsById.clear();
    this.clientsSnapshotReceived = false;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!env.statsRealtimeEnabled) {
      this.setStatus("disabled");
      return;
    }
    this.setStatus("reconnecting");
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private handleMessage(raw: string): void {
    let msg: ServerEnvelope;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "snapshot":
      case "update":
        this.applyChannelData(msg);
        break;
      case "ping":
        // The API heartbeats at us too; answering keeps the exchange
        // symmetric rather than relying on our own ping being the only
        // traffic that resets its idle timer.
        this.send({ type: "pong" });
        break;
      case "pong":
      case "subscribed":
      case "error":
        // Nothing to do: "pong" only resets the staleness clock (already
        // done by the caller), "subscribed" is an ack, and "error" reports a
        // bad subscribe - a bug in this file, not a runtime condition to
        // recover from.
        break;
    }
  }

  private applyChannelData(msg: ServerEnvelope): void {
    if (msg.channel === "stats:summary") {
      this.summarySnapshot = msg.data as StatsSummary;
      this.emit("summary", this.summarySnapshot);
      return;
    }

    if (msg.channel === "stats:events") {
      this.eventsSnapshot = msg.data as StatsEventsResponse;
      this.emit("events", this.eventsSnapshot);
      return;
    }

    if (msg.channel === "stats:clients") {
      const data = msg.data as { clients?: UpdaterClient[] } & ClientsDelta;
      if (Array.isArray(data.clients)) {
        // Full snapshot: on subscribe, and again on every API tick (it has
        // no per-tick delta to compute).
        this.clientsById = new Map(data.clients.map((c) => [c.id, c]));
      } else {
        for (const client of data.upserted ?? []) this.clientsById.set(client.id, client);
        for (const id of data.removed_ids ?? []) this.clientsById.delete(id);
      }
      this.clientsSnapshotReceived = true;
      this.emit("clients", Array.from(this.clientsById.values()));
    }
  }
}

const globalForHub = globalThis as unknown as { statsHub?: StatsHub };

// Survives next dev's HMR module re-evaluation, same pattern as the usual
// Prisma-client singleton.
export const statsHub = globalForHub.statsHub ?? new StatsHub();
if (process.env.NODE_ENV !== "production") globalForHub.statsHub = statsHub;
