import { cache } from "react";
import { getTranslations } from "next-intl/server";
import {
  getAllStatsClients,
  getStatsSummary,
  getStatsEvents,
  getUpdateManifest,
  getUpdaterManifest,
  type StatsEventBucket,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  defaultStatsProduct,
  getUserProductOptions,
  statsProductFilters,
  userProductSlugs,
} from "@/lib/products";
import { EMLY_PRODUCT } from "@/lib/product-rules";
import { getPageStatsHub } from "@/lib/realtime/page-hub";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsSummaryCardsLive } from "@/components/stats-summary-cards-live";
import { StatsEventsChartLive } from "@/components/stats-events-chart-live";
import { StatsFleetCharts } from "@/components/stats-fleet-charts";
import { StatsLiveBadge } from "@/components/stats-live-badge";
import { StatsProductFilter } from "@/components/stats-product-filter";
import { NoProductsNotice } from "@/components/no-products-notice";

/**
 * One clock reading per request, for the same reason as on /clients: the
 * fleet charts bucket machines by how long ago they were seen, so the
 * browser must start from the instant the server rendered at.
 */
const getRenderedAt = cache(() => Date.now());

interface PageProps {
  searchParams: Promise<{ bucket?: string; event_type?: string; product?: string }>;
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const { bucket: bucketStr, event_type, product: productParam } = await searchParams;
  const bucket: StatsEventBucket = bucketStr === "hour" ? "hour" : "day";

  const [t, user, productOptions] = await Promise.all([
    getTranslations("statistics"),
    getCurrentUser(),
    getUserProductOptions(),
  ]);

  const header = (actions?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {actions}
    </div>
  );

  // No products, no machines: the API would answer every call with nothing.
  if (userProductSlugs(user).length === 0) {
    return (
      <div className="space-y-6">
        {header()}
        <NoProductsNotice />
      </div>
    );
  }

  // An unknown or unassigned value falls back to the default rather than
  // asking the API for a 403.
  const product =
    productParam && statsProductFilters(user).includes(productParam)
      ? productParam
      : defaultStatsProduct(user);

  // Opening the page is what warms the hub; from the second render on, its
  // WS snapshots stand in for the REST calls this page used to make on every
  // load. REST stays as the cold-start (and hub-down) path only - and, for
  // the hour bucket, as the one view the single events subscription can't
  // serve. Note the events fetch deliberately drops event_type: filtering by
  // type happens client-side, off the same unfiltered rows the stream sends.
  const hub = await getPageStatsHub(product);
  const cachedSummary = hub?.getSummarySnapshot();
  const cachedEvents = hub?.getEventsSnapshot();
  const cachedClients = hub?.getClientsSnapshot();

  // The manifests only set the "latest" marker on the version charts, so a
  // failed one hides that marker rather than the page.
  const [summaryResult, eventsResult, clients, updaterManifest, appManifest] = await Promise.all([
    cachedSummary ?? getStatsSummary({ product }).catch(() => null),
    cachedEvents?.bucket === bucket
      ? cachedEvents
      : getStatsEvents({ product, bucket }).catch(() => null),
    cachedClients ?? getAllStatsClients().catch(() => null),
    getUpdaterManifest().catch(() => null),
    getUpdateManifest(EMLY_PRODUCT).catch(() => null),
  ]);

  // An empty `version` is the updater kill-switch, not a release to chase.
  const latestUpdaterVersion = updaterManifest?.version?.trim() || null;
  const latestAppVersion = appManifest?.stableVersion?.trim() || null;

  return (
    // Keyed by product: switching filter must drop the previous product's
    // streamed state, not merge the new initial data into it.
    <StatsStreamProvider
      key={product}
      initialSummary={summaryResult}
      initialClients={clients ?? []}
      product={product}
      enabled={env.statsRealtimeEnabled}
    >
      <div className="space-y-6">
        {header(
          <div className="flex items-center gap-3">
            <StatsProductFilter value={product} products={productOptions} />
            <StatsLiveBadge />
          </div>,
        )}

        <StatsSummaryCardsLive />

        <StatsEventsChartLive
          initial={eventsResult?.data ?? []}
          bucket={bucket}
          eventType={event_type ?? "all"}
        />

        <StatsFleetCharts
          renderedAt={getRenderedAt()}
          windowMinutes={summaryResult?.window_minutes ?? 15}
          latestUpdaterVersion={latestUpdaterVersion}
          latestAppVersion={latestAppVersion}
        />
      </div>
    </StatsStreamProvider>
  );
}
