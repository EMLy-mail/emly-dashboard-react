"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StatsEventsResponse, StatsSummary, UpdaterClient } from "@/lib/api";

interface StatsStreamState {
  summary: StatsSummary | null;
  clients: UpdaterClient[];
  /**
   * Live events payload, or null until one arrives. Unlike summary/clients
   * this is *not* seeded from the server-rendered data: the hub only carries
   * the day bucket, so consumers must check `events.bucket` against the
   * bucket they're rendering before using it (see StatsEventsChartLive).
   */
  events: StatsEventsResponse | null;
  /** True once /api/stats/live confirms the hub's WS to the API is open. */
  live: boolean;
}

const StatsStreamContext = createContext<StatsStreamState>({
  summary: null,
  clients: [],
  events: null,
  live: false,
});

/**
 * Owns the single EventSource for the whole statistics page (see
 * docs/specs/2026-09-04-websocket-stats-realtime-nextjs.md §4). State starts
 * from the server-rendered `initial*` props, so there's no loading flash, and
 * every later update arrives pushed - the page issues no further requests of
 * its own. If `enabled` is false, or the stream never connects, this stays
 * exactly as informative as the pre-realtime page: initial props only, `live`
 * stuck at false.
 */
export function StatsStreamProvider({
  initialSummary,
  initialClients,
  enabled = true,
  children,
}: {
  initialSummary: StatsSummary | null;
  initialClients: UpdaterClient[];
  enabled?: boolean;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<StatsSummary | null>(initialSummary);
  const [clients, setClients] = useState<UpdaterClient[]>(initialClients);
  const [events, setEvents] = useState<StatsEventsResponse | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource("/api/stats/live");

    source.addEventListener("stats-summary", (e) => setSummary(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("stats-clients", (e) => setClients(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("stats-events", (e) => setEvents(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("stats-status", (e) => setLive(JSON.parse((e as MessageEvent).data).live));
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [enabled]);

  return (
    <StatsStreamContext.Provider value={{ summary, clients, events, live }}>
      {children}
    </StatsStreamContext.Provider>
  );
}

export function useStatsStreamContext(): StatsStreamState {
  return useContext(StatsStreamContext);
}
