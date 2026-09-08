"use client";

import { useMemo } from "react";
import { useLiveStatsEvents } from "@/hooks/use-stats-stream";
import { StatsEventsChart } from "./stats-events-chart";
import type { StatsEventBucket, StatsEventsResponse } from "@/lib/api";

/**
 * The hub subscribes to the events channel once, at the day bucket and
 * unfiltered by type (see lib/realtime/stats-hub.ts), so:
 *   - the event-type filter is applied here rather than server-side, which
 *     means switching type needs no fetch at all;
 *   - the hour bucket can't be served from the stream, so that view keeps
 *     rendering `initial` (fetched once by the page) and simply doesn't
 *     live-update.
 */
export function StatsEventsChartLive({
  initial,
  bucket,
  eventType,
}: {
  initial: StatsEventsResponse["data"];
  bucket: StatsEventBucket;
  eventType: string;
}) {
  const { events } = useLiveStatsEvents();

  const data = useMemo(() => {
    const rows = events?.bucket === bucket ? events.data : initial;
    return eventType === "all" ? rows : rows.filter((row) => row.event_type === eventType);
  }, [events, initial, bucket, eventType]);

  return <StatsEventsChart data={data} bucket={bucket} eventType={eventType} />;
}
