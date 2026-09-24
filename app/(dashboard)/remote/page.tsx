import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAllStatsClients, getStatsSummary } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { statsHub } from "@/lib/realtime/stats-hub";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsLiveBadge } from "@/components/stats-live-badge";
import { RemoteControl } from "@/components/remote-control";

export default async function RemotePage() {
  const user = await getCurrentUser();
  // Every button here acts on a user's machine; a non-admin has nothing to do
  // on this page (the actions re-check the role regardless).
  if (user?.role !== "admin") redirect("/clients");

  // Same warm-up as the clients page: the hub's snapshot stands in for REST
  // and, from then on, live presence arrives pushed.
  statsHub.ensureStarted();
  const [t, summary, clients] = await Promise.all([
    getTranslations("remote"),
    statsHub.getSummarySnapshot() ?? getStatsSummary().catch(() => null),
    statsHub.getClientsSnapshot() ?? getAllStatsClients().catch(() => null),
  ]);

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
        <RemoteControl />
      </div>
    </StatsStreamProvider>
  );
}
