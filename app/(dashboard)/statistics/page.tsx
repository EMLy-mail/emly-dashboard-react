import { getTranslations } from "next-intl/server";
import { getStatsSummary, getAllStatsClients, getStatsEvents, type StatsEventBucket } from "@/lib/api";
import { env } from "@/lib/env";
import { statsHub } from "@/lib/realtime/stats-hub";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsSummaryCardsLive } from "@/components/stats-summary-cards-live";
import { StatsClientsTableLive } from "@/components/stats-clients-table-live";
import { StatsEventsChartLive } from "@/components/stats-events-chart-live";
import { StatsLiveBadge } from "@/components/stats-live-badge";

interface PageProps {
  searchParams: Promise<{ bucket?: string; event_type?: string }>;
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const { bucket: bucketStr, event_type } = await searchParams;
  const bucket: StatsEventBucket = bucketStr === "hour" ? "hour" : "day";

  // Opening the page is what warms the hub; from the second render on, its
  // WS snapshots stand in for the REST calls this page used to make on every
  // load. REST stays as the cold-start (and hub-down) path only - and, for
  // the hour bucket, as the one view the single events subscription can't
  // serve. Note the events fetch deliberately drops event_type: filtering by
  // type happens client-side, off the same unfiltered rows the stream sends.
  statsHub.ensureStarted();
  const cachedSummary = statsHub.getSummarySnapshot();
  const cachedClients = statsHub.getClientsSnapshot();
  const cachedEvents = statsHub.getEventsSnapshot();

  const [t, summaryResult, clients, eventsResult] = await Promise.all([
    getTranslations("statistics"),
    cachedSummary ?? getStatsSummary().catch(() => null),
    cachedClients ?? getAllStatsClients().catch(() => null),
    cachedEvents?.bucket === bucket ? cachedEvents : getStatsEvents({ bucket }).catch(() => null),
  ]);

  const windowMinutes = summaryResult?.window_minutes ?? 15;

  return (
    <StatsStreamProvider
      initialSummary={summaryResult}
      initialClients={clients ?? []}
      enabled={env.statsRealtimeEnabled}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          <StatsLiveBadge />
        </div>

        <StatsSummaryCardsLive />

        <StatsEventsChartLive
          initial={eventsResult?.data ?? []}
          bucket={bucket}
          eventType={event_type ?? "all"}
        />

        <StatsClientsTableLive windowMinutes={windowMinutes} />
      </div>
    </StatsStreamProvider>
  );
}
