import "server-only";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { env, SERVER_USER_AGENT } from "@/lib/env";
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

// A hub nobody is listening to (no open SSE stream) is closed once it has
// gone this long without a page asking for it. The sweep runs often enough
// that a logged-out session's socket does not linger for long.
const IDLE_CLOSE_MS = 5 * 60_000;
const IDLE_SWEEP_MS = 60_000;

export type StatsHubStatus = "disabled" | "connecting" | "open" | "reconnecting";

function wsUrlFromApiBaseUrl(apiBaseUrl: string): string {
  const url = new URL("/v2/stats/stream", apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Long-lived WS connection to the API's stats stream for one session and one
 * product filter, shared by every browser tab of that session via
 * app/api/stats/live/route.ts. Never opened per-request - see
 * docs/specs/2026-09-04-websocket-stats-realtime-nextjs.md §2.
 *
 * The API scopes the stream by the session token it gets at the upgrade
 * (only the user's products, only the machines that run them), so one
 * connection cannot serve two users: get hubs from `getStatsHub`, never share
 * one across sessions.
 */
class StatsHub extends EventEmitter {
  private ws: WebSocket | null = null;
  private started = false;
  private disposed = false;
  /** Last time a page or stream asked for this hub - drives the idle close. */
  lastUsedAt = Date.now();
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

  constructor(
    private readonly sessionToken: string,
    /** The stats `product` filter every channel is subscribed with. */
    readonly product: string,
  ) {
    super();
  }

  /** Idempotent - safe to call from every incoming request. */
  ensureStarted(): void {
    this.lastUsedAt = Date.now();
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

  /** True while at least one SSE stream is attached. */
  hasListeners(): boolean {
    return this.eventNames().some((name) => this.listenerCount(name) > 0);
  }

  /** Closes the socket for good; the registry drops the hub right after. */
  dispose(): void {
    this.disposed = true;
    this.stopTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.terminate();
    this.ws = null;
    this.removeAllListeners();
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

    // The session token is what scopes the stream to this user's products;
    // without it the admin key would stream the whole fleet.
    const headers: Record<string, string> = {
      "X-Admin-Key": env.adminKey,
      "X-Session-Token": this.sessionToken,
      "User-Agent": SERVER_USER_AGENT,
    };
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
        product: this.product,
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
    if (this.disposed) return;
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
    if (this.disposed) return;
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
        // bad subscribe - a bug in this file, or a product the user has lost
        // since the page checked it, which leaves the channels empty and the
        // page on its REST data.
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

// ── Registry ────────────────────────────────────────────────────────────────

interface HubRegistry {
  hubs: Map<string, StatsHub>;
  sweeper: ReturnType<typeof setInterval> | null;
}

const globalForHub = globalThis as unknown as { statsHubs?: HubRegistry };

// Survives next dev's HMR module re-evaluation, same pattern as the usual
// Prisma-client singleton.
const registry: HubRegistry = globalForHub.statsHubs ?? { hubs: new Map(), sweeper: null };
if (process.env.NODE_ENV !== "production") globalForHub.statsHubs = registry;

// Keyed by a hash so the map never holds the raw token as a key.
function hubKey(sessionToken: string, product: string): string {
  return createHash("sha256").update(sessionToken).digest("hex") + "|" + product;
}

function sweepIdleHubs(): void {
  const now = Date.now();
  for (const [key, hub] of registry.hubs) {
    if (!hub.hasListeners() && now - hub.lastUsedAt > IDLE_CLOSE_MS) {
      hub.dispose();
      registry.hubs.delete(key);
    }
  }
  if (registry.hubs.size === 0 && registry.sweeper) {
    clearInterval(registry.sweeper);
    registry.sweeper = null;
  }
}

/**
 * The hub for one session and one stats product filter, created on first use.
 * Callers validate `product` against the user's scope first; the API would
 * refuse it anyway, but only after opening a connection for nothing.
 */
export function getStatsHub(sessionToken: string, product: string): StatsHub {
  const key = hubKey(sessionToken, product);
  let hub = registry.hubs.get(key);
  if (!hub) {
    hub = new StatsHub(sessionToken, product);
    registry.hubs.set(key, hub);
  }
  if (!registry.sweeper) {
    registry.sweeper = setInterval(sweepIdleHubs, IDLE_SWEEP_MS);
    registry.sweeper.unref?.();
  }
  hub.ensureStarted();
  return hub;
}

export type { StatsHub };
