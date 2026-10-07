"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, RefreshCw } from "lucide-react";
import type { ClientEventRecord } from "@/lib/api";
import { listEventsAction } from "@/lib/actions/client-commands";
import { formatDateTime } from "@/lib/format-date";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PayloadViewer } from "@/components/payload-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EVENTS_POLL_MS = 10000;

/**
 * The events a machine pushed over its WebSocket (session changes and the
 * like), polled while mounted. The API keeps them in memory and only admins
 * may read them (listEventsAction re-checks), so render this for those only.
 * Shared by the remote control page and the client detail page.
 */
export function ClientWsEvents({ clientId }: { clientId: number }) {
  const t = useTranslations("remote");
  const [events, setEvents] = useState<{ clientId: number; list: ClientEventRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number) => {
    const r = await listEventsAction(id);
    if (r.ok) {
      setEvents({ clientId: id, list: r.events });
      setError(null);
    } else {
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const r = await listEventsAction(clientId);
      if (cancelled) return;
      if (r.ok) {
        setEvents({ clientId, list: r.events });
        setError(null);
      } else {
        setError(r.error);
      }
    };
    void run();
    const timer = setInterval(() => void run(), EVENTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientId]);

  // A list fetched for the previously selected machine is not shown for this one.
  const list = events && events.clientId === clientId ? events.list : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          {t("events.title")}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("events.refresh")}
          onClick={() => void load(clientId)}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("events.hint")}</p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {list?.length === 0 && <p className="text-sm text-muted-foreground">{t("events.empty")}</p>}
        {list
          ?.slice()
          .reverse()
          .map((e, i) => (
            <details key={e.id ?? i} className="rounded-md border px-3 py-2 text-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-mono">{e.name}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(e.received_at)}</span>
                {e.truncated && <Badge variant="outline">{t("events.truncated")}</Badge>}
              </summary>
              {e.payload !== undefined && (
                <PayloadViewer data={e.payload} rootName={e.name} className="mt-2" />
              )}
            </details>
          ))}
      </CardContent>
    </Card>
  );
}
