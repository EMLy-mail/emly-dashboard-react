"use client";

import { useStatsStreamContext } from "@/components/stats-stream-provider";
import type { StatsEventsResponse, StatsSummary, UpdaterClient } from "@/lib/api";

export function useLiveStatsSummary(): { summary: StatsSummary | null; live: boolean } {
  const { summary, live } = useStatsStreamContext();
  return { summary, live };
}

export function useLiveStatsClients(): { clients: UpdaterClient[]; live: boolean } {
  const { clients, live } = useStatsStreamContext();
  return { clients, live };
}

export function useLiveStatsEvents(): { events: StatsEventsResponse | null; live: boolean } {
  const { events, live } = useStatsStreamContext();
  return { events, live };
}

export function useStatsLive(): boolean {
  return useStatsStreamContext().live;
}
