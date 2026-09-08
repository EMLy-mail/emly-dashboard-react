"use client";

import { useTranslations } from "next-intl";
import type { StatsSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StatsSummaryCards({ summary }: { summary: StatsSummary }) {
  const t = useTranslations("statistics.summary");
  const tEvents = useTranslations("statistics.events");

  function eventLabel(type: string) {
    return type === "manifest_check" || type === "download" ? tEvents(type) : type;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalClients")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.total_clients}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectedClients")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-bold">{summary.connected_clients}</p>
          <p className="text-xs text-muted-foreground">
            {t("windowMinutes", { minutes: summary.window_minutes })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("eventsLast24h")}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.events_last_24h.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <ul className="space-y-1">
              {summary.events_last_24h.map(({ event_type, count }) => (
                <li key={event_type} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{eventLabel(event_type)}</span>
                  <span className="font-mono font-medium">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("clientsByVersion")}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.clients_by_version.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {summary.clients_by_version.map(({ updater_version, count }) => (
                <li key={updater_version ?? "unknown"}>
                  <Badge variant="outline" className="font-mono">
                    {updater_version ?? t("unknownVersion")} · {count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
