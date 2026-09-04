"use client";

import { useLiveStatsSummary } from "@/hooks/use-stats-stream";
import { StatsSummaryCards } from "./stats-summary-cards";

export function StatsSummaryCardsLive() {
  const { summary } = useLiveStatsSummary();
  if (!summary) return null;
  return <StatsSummaryCards summary={summary} />;
}
