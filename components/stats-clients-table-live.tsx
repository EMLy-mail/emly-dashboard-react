"use client";

import { useLiveStatsClients } from "@/hooks/use-stats-stream";
import { StatsClientsTable } from "./stats-clients-table";

export function StatsClientsTableLive({ windowMinutes }: { windowMinutes: number }) {
  const { clients } = useLiveStatsClients();
  return <StatsClientsTable data={clients} windowMinutes={windowMinutes} />;
}
