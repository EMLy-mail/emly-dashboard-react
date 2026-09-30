import { cache } from "react";
import { getTranslations } from "next-intl/server";
import {
  getAllStatsClients,
  getBans,
  getConfigRevisions,
  getConfigRevision,
  getStatsSummary,
  getUpdateManifest,
  getUpdaterManifest,
  type Ban,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { defaultStatsProduct, userProductSlugs } from "@/lib/products";
import { EMLY_PRODUCT } from "@/lib/product-rules";
import { getPageStatsHub } from "@/lib/realtime/page-hub";
import { readDcLookupMap, type DcLookupMap } from "@/lib/device-status";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsLiveBadge } from "@/components/stats-live-badge";
import { ClientsExplorer } from "@/components/clients-explorer";
import { NoProductsNotice } from "@/components/no-products-notice";

/**
 * One clock reading per request. Every rank turns on whether a machine is
 * still inside the online window, so the browser has to score against the
 * same instant the server did or it hydrates to different counts. cache()
 * also keeps the value fixed if the tree renders more than once.
 */
const getRenderedAt = cache(() => Date.now());

/**
 * Resolves the `dcLookupMap` the fleet is actually running on: the published
 * revision, not the newest draft. A draft nobody has published describes a
 * network no client is using, so scoring against it would report sites that
 * do not exist yet.
 */
async function loadDcLookupMap(): Promise<DcLookupMap | null> {
  const list = await getConfigRevisions({ page: 1, page_size: 1, status: "published" });
  const published = list.revisions[0];
  if (!published) return null;
  const revision = await getConfigRevision(published.revision);
  return readDcLookupMap(revision.document);
}

export default async function ClientsPage() {
  const user = await getCurrentUser();
  // The API shows a user only the machines running one of their products.
  if (userProductSlugs(user).length === 0) {
    const t = await getTranslations("clients");
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <NoProductsNotice />
      </div>
    );
  }

  // Same warm-up the statistics page does: opening either page starts the
  // hub, and from then on its snapshots stand in for these REST calls. The
  // machine list is the same whatever the product filter; the statistics
  // page's default is used so both pages share one connection.
  const statsProduct = defaultStatsProduct(user);
  const hub = await getPageStatsHub(statsProduct);
  const cachedSummary = hub?.getSummarySnapshot();
  const cachedClients = hub?.getClientsSnapshot();

  // Every lookup here is a side input to the ranking, and none of them is
  // worth 500-ing the page over: a machine list with an unknown target
  // version is still useful, a blank page is not. Each failure degrades one
  // rule instead of the whole view.
  const [t, summary, clients, bans, updaterManifest, appManifest, dcLookupMap] = await Promise.all([
    getTranslations("clients"),
    cachedSummary ?? getStatsSummary({ product: statsProduct }).catch(() => null),
    cachedClients ?? getAllStatsClients().catch(() => null),
    getBans().catch((): Ban[] => []),
    getUpdaterManifest().catch(() => null),
    // The target EMLy build the ranking compares `emly_version` against.
    getUpdateManifest(EMLY_PRODUCT).catch(() => null),
    loadDcLookupMap().catch(() => null),
  ]);

  const windowMinutes = summary?.window_minutes ?? 15;
  // An empty `version` is the updater kill-switch, not a release to chase.
  const latestUpdaterVersion = updaterManifest?.version?.trim() || null;
  const latestAppVersion = appManifest?.stableVersion?.trim() || null;

  return (
    <StatsStreamProvider
      initialSummary={summary}
      initialClients={clients ?? []}
      product={statsProduct}
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

        <ClientsExplorer
          renderedAt={getRenderedAt()}
          bans={bans}
          latestUpdaterVersion={latestUpdaterVersion}
          latestAppVersion={latestAppVersion}
          dcLookupMap={dcLookupMap}
          windowMinutes={windowMinutes}
        />
      </div>
    </StatsStreamProvider>
  );
}
