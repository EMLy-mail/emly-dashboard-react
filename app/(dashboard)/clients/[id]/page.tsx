import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getStatsClientDetail, getBans, ApiError, type Ban } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getUserProductOptions } from "@/lib/products";
import { canUseRemoteControl, isAdminRole } from "@/lib/roles";
import { ClientWsEvents } from "@/components/client-ws-events";
import { CreateBanDialog } from "@/components/create-ban-dialog";
import { DeleteClientButton } from "@/components/delete-client-button";
import { LoggedUserName } from "@/components/logged-user-name";
import { isSessionDisconnected } from "@/lib/device-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Ban as BanIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";

// Events shown before the "show more" toggle.
const EVENTS_PREVIEW = 10;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StatsClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const clientId = parseInt(id, 10);

  if (isNaN(clientId)) notFound();

  let detail;
  try {
    detail = await getStatsClientDetail(clientId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [t, tEvents, tBans, tHint, currentUser, productOptions] = await Promise.all([
    getTranslations("statistics.clientDetail"),
    getTranslations("statistics.events"),
    getTranslations("bans"),
    getTranslations("clients.iconHint"),
    getCurrentUser(),
    getUserProductOptions(),
  ]);
  const isAdmin = isAdminRole(currentUser?.role);
  const canSeeWsEvents = canUseRemoteControl(currentUser?.role);
  const { client, events } = detail;
  const installedProducts = detail.products ?? [];
  const productNames = new Map(productOptions.map((p) => [p.slug, p.name]));

  // A ban is by identifier, not by client row, so "is this machine blocked"
  // is a question about three separate values - any one of them being on the
  // list is enough to cut the machine off. Fetched best-effort: the block
  // list is a side note here, and a hiccup reading it must not 500 the page
  // an operator opened to look at events.
  let bans: Ban[] = [];
  try {
    bans = await getBans();
  } catch {
    bans = [];
  }
  const matchedBans = bans.filter(
    (b) =>
      (b.ban_type === "hostname" && b.value.toLowerCase() === client.hostname.toLowerCase()) ||
      (b.ban_type === "hwid" && !!client.hwid && b.value === client.hwid) ||
      (b.ban_type === "ip" && !!client.last_ip && b.value === client.last_ip),
  );

  function eventLabel(type: string) {
    return type === "manifest_check" || type === "download" ? tEvents(type) : type;
  }

  function renderEvent(event: (typeof events)[number]) {
    return (
      <div key={event.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="font-mono">{eventLabel(event.event_type)}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
        {event.version && <Badge variant="outline" className="font-mono">{event.version}</Badge>}
        {event.ip_address && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">{event.ip_address}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/clients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t("title", { hostname: client.hostname })}</h1>
      </div>

      {matchedBans.length > 0 && (
        <Alert variant="destructive">
          <BanIcon className="h-4 w-4" />
          <AlertDescription>
            {tBans("clientBanned", {
              rules: matchedBans.map((b) => `${tBans(`type.${b.ban_type}`)}: ${b.value}`).join(", "),
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Prefilled straight from the row being looked at - the identifiers
          are right here, and retyping a HWID by hand is how you ban the
          wrong machine. Every button here is admin-only (the actions
          re-check the role regardless), so the whole row is hidden for
          anyone else rather than left as an empty container. */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <CreateBanDialog
            compact
            defaultType="hostname"
            defaultValue={client.hostname}
            label={tBans("banHostname")}
          />
          {client.hwid && (
            <CreateBanDialog
              compact
              defaultType="hwid"
              defaultValue={client.hwid}
              label={tBans("banHwid")}
            />
          )}
          {client.last_ip && (
            <CreateBanDialog
              compact
              defaultType="ip"
              defaultValue={client.last_ip}
              label={tBans("banIp")}
            />
          )}
          <DeleteClientButton clientId={client.id} hostname={client.hostname} />
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.hostname")}</p>
            <p className="font-medium">{client.hostname}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.adDomain")}</p>
            <p className="font-medium">{client.ad_domain || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.hwid")}</p>
            <p className="font-medium">{client.hwid || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.loggedUser")}</p>
            <p className="font-medium">
              {client.logged_user ? (
                <LoggedUserName
                  name={client.logged_user}
                  disconnected={isSessionDisconnected(client)}
                  hint={
                    client.logged_user_disconnected_at
                      ? tHint("sessionDisconnectedSince", {
                          date: formatDateTime(client.logged_user_disconnected_at),
                        })
                      : tHint("sessionDisconnected")
                  }
                />
              ) : (
                "—"
              )}
            </p>
            {/* A snapshot from the last sighting: a machine that stopped
                checking in (or runs an updater older than 1.6.2, which never
                clears it) still shows its last known user. Spelling out when
                it was observed keeps that from reading as "logged on now". */}
            {client.logged_user && (
              <p className="text-xs text-muted-foreground">
                {t("info.loggedUserAsOf", { date: formatDateTime(client.last_seen_at) })}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.serial")}</p>
            <p className="font-mono font-medium">{client.serial ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.product")}</p>
            <p className="font-mono font-medium">{client.product ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.version")}</p>
            <p className="font-mono font-medium">{client.updater_version ?? "—"}</p>
          </div>
          {/* The machine's full inventory as the Agent last reported it. A
              product the user is not assigned still shows, by slug: it is
              what is installed, not what the user may manage. */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.installedProducts")}</p>
            {installedProducts.length === 0 ? (
              <p className="font-medium">—</p>
            ) : (
              <ul className="space-y-0.5">
                {installedProducts.map((p) => (
                  <li key={p.product} className="text-sm">
                    <span className="font-medium">{productNames.get(p.product) ?? p.product}</span>{" "}
                    <span className="font-mono">{p.version}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {t("info.installedSince", { date: formatDateTime(p.updated_at) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.osVersion")}</p>
            <p className="font-medium">{client.os_version ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.lastIp")}</p>
            <p className="font-mono font-medium">{client.last_ip ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.firstSeen")}</p>
            <p className="font-medium">{formatDateTime(client.first_seen_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.lastSeen")}</p>
            <p className="font-medium">{formatDateTime(client.last_seen_at)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Same look as the WebSocket events card below it. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t("events.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("events.table.noData")}</p>
          )}
          {events.slice(0, EVENTS_PREVIEW).map(renderEvent)}
          {/* Native <details>: the page stays a server component. The summary
              swaps its label on open through the group-open variant. */}
          {events.length > EVENTS_PREVIEW && (
            <details className="group space-y-2">
              <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  {t("events.showMore", { count: events.length - EVENTS_PREVIEW })}
                </span>
                <span className="hidden group-open:inline">{t("events.showLess")}</span>
              </summary>
              <div className="space-y-2">{events.slice(EVENTS_PREVIEW).map(renderEvent)}</div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* What the machine pushed over its WebSocket (session changes, ...),
          the same list the remote control page shows. Admin-only, like the
          endpoint behind it. */}
      {canSeeWsEvents && <ClientWsEvents clientId={client.id} />}
    </div>
  );
}
