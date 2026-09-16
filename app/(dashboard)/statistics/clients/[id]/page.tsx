import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getStatsClientDetail, getBans, ApiError, type Ban } from "@/lib/api";
import { CreateBanDialog } from "@/components/create-ban-dialog";
import { LoggedUserName } from "@/components/logged-user-name";
import { isSessionDisconnected } from "@/lib/device-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Ban as BanIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  const [t, tEvents, tBans, tHint] = await Promise.all([
    getTranslations("statistics.clientDetail"),
    getTranslations("statistics.events"),
    getTranslations("bans"),
    getTranslations("clients.iconHint"),
  ]);
  const { client, events } = detail;

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

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/statistics">
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
          wrong machine. */}
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
      </div>

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
                          date: new Date(client.logged_user_disconnected_at).toLocaleString(),
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
                {t("info.loggedUserAsOf", { date: new Date(client.last_seen_at).toLocaleString() })}
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
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.contact")}</p>
            <p className="font-medium">{client.contact ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.lastIp")}</p>
            <p className="font-mono font-medium">{client.last_ip ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.firstSeen")}</p>
            <p className="font-medium">{new Date(client.first_seen_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("info.lastSeen")}</p>
            <p className="font-medium">{new Date(client.last_seen_at).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("events.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.table.type")}</TableHead>
                <TableHead>{t("events.table.version")}</TableHead>
                <TableHead>{t("events.table.ip")}</TableHead>
                <TableHead>{t("events.table.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {t("events.table.noData")}
                  </TableCell>
                </TableRow>
              )}
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{eventLabel(event.event_type)}</TableCell>
                  <TableCell className="font-mono text-sm">{event.version ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{event.ip_address ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
