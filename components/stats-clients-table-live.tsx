"use client";

import { useLiveStatsClients } from "@/hooks/use-stats-stream";
import { StatsClientsTable } from "./stats-clients-table";

export function StatsClientsTableLive({
  windowMinutes,
  showDeprecatedBanner,
}: {
  windowMinutes: number;
  showDeprecatedBanner?: boolean;
}) {
  const { clients } = useLiveStatsClients();
  return (
    <StatsClientsTable
      data={clients}
      windowMinutes={windowMinutes}
      showDeprecatedBanner={showDeprecatedBanner}
    />
  );
}
