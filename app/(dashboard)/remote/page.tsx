import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Info } from "lucide-react";
import { getAllStatsClients, getStatsSummary } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { defaultStatsProduct } from "@/lib/products";
import { getPageStatsHub } from "@/lib/realtime/page-hub";
import { StatsStreamProvider } from "@/components/stats-stream-provider";
import { StatsLiveBadge } from "@/components/stats-live-badge";
import { RemoteControl } from "@/components/remote-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { canUseRemoteControl } from "@/lib/roles";

export default async function RemotePage() {
  const user = await getCurrentUser();
  // Admins and owners only. Every button here acts on a user's machine, and
  // the actions re-check the role regardless.
  if (!canUseRemoteControl(user?.role)) redirect("/clients");

  // Same warm-up as the clients page: the hub's snapshot stands in for REST
  // and, from then on, live presence arrives pushed.
  const statsProduct = defaultStatsProduct(user);
  const hub = await getPageStatsHub(statsProduct);
  const [t, summary, clients] = await Promise.all([
    getTranslations("remote"),
    hub?.getSummarySnapshot() ?? getStatsSummary({ product: statsProduct }).catch(() => null),
    hub?.getClientsSnapshot() ?? getAllStatsClients().catch(() => null),
  ]);

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
        <div className="space-y-2">
          {/* Commands act on users' real machines and the feature is still in beta. */}
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle className="font-semibold">{t("beta.title")}</AlertTitle>
            <AlertDescription>{t("beta.description")}</AlertDescription>
          </Alert>
          {/* Only true while the disruptive commands are locked by configuration. */}
          {env.lockDangerousRemoteControls && (
            <Alert>
              <Info />
              <AlertTitle className="font-semibold">{t("readOnly.title")}</AlertTitle>
              <AlertDescription>{t("readOnly.description")}</AlertDescription>
            </Alert>
          )}
        </div>
        <RemoteControl lockDangerous={env.lockDangerousRemoteControls} />
      </div>
    </StatsStreamProvider>
  );
}
