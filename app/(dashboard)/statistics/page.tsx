import { getTranslations } from "next-intl/server";
import { getStatsSummary, getStatsClients, getStatsEvents, type StatsEventBucket } from "@/lib/api";
import { StatsSummaryCards } from "@/components/stats-summary-cards";
import { StatsEventsChart } from "@/components/stats-events-chart";
import { StatsClientsTable } from "@/components/stats-clients-table";

interface PageProps {
  searchParams: Promise<{ page?: string; online?: string; bucket?: string; event_type?: string }>;
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const { page: pageStr, online: onlineStr, bucket: bucketStr, event_type } = await searchParams;
  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const online = onlineStr === "true";
  const bucket: StatsEventBucket = bucketStr === "hour" ? "hour" : "day";

  const [t, summaryResult, clientsResult, eventsResult] = await Promise.all([
    getTranslations("statistics"),
    getStatsSummary().catch(() => null),
    getStatsClients({ page, page_size: 20, online }).catch(() => null),
    getStatsEvents({ bucket, event_type }).catch(() => null),
  ]);

  const windowMinutes = summaryResult?.window_minutes ?? 15;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {summaryResult && <StatsSummaryCards summary={summaryResult} />}

      <StatsEventsChart data={eventsResult?.data ?? []} bucket={bucket} eventType={event_type ?? "all"} />

      <StatsClientsTable
        data={clientsResult?.data ?? []}
        totalPages={clientsResult?.total_pages ?? 0}
        currentPage={page}
        online={online}
        windowMinutes={windowMinutes}
      />
    </div>
  );
}
