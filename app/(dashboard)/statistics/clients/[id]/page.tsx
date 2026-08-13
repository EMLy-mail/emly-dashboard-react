import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getStatsClientDetail, ApiError } from "@/lib/api";
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

  const [t, tEvents] = await Promise.all([
    getTranslations("statistics.clientDetail"),
    getTranslations("statistics.events"),
  ]);
  const { client, events } = detail;

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
