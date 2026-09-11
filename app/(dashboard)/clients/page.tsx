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
import { env } from "@/lib/env";
import { statsHub } from "@/lib/realtime/stats-hub";
import { readDcLookupMap, type DcLookupMap } from "@/lib/device-status";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsLiveBadge } from "@/components/stats-live-badge";
import { ClientsExplorer } from "@/components/clients-explorer";

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
  // Same warm-up the statistics page does: opening either page starts the hub,
  // and from then on its snapshots stand in for these REST calls.
  statsHub.ensureStarted();
  const cachedSummary = statsHub.getSummarySnapshot();
  const cachedClients = statsHub.getClientsSnapshot();

  // Every lookup here is a side input to the ranking, and none of them is
  // worth 500-ing the page over: a machine list with an unknown target
  // version is still useful, a blank page is not. Each failure degrades one
  // rule instead of the whole view.
  const [t, summary, clients, bans, updaterManifest, appManifest, dcLookupMap] = await Promise.all([
    getTranslations("clients"),
    cachedSummary ?? getStatsSummary().catch(() => null),
    cachedClients ?? getAllStatsClients().catch(() => null),
    getBans().catch((): Ban[] => []),
    getUpdaterManifest().catch(() => null),
    getUpdateManifest().catch(() => null),
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
