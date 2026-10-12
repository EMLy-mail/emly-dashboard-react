"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { ClientLogRecord } from "@/lib/api";
import { deleteClientLogAction, listClientLogsAction } from "@/lib/actions/client-commands";
import { formatDateTime } from "@/lib/format-date";
import { formatBytes } from "@/lib/utils";
import { ClientLogViewer } from "@/components/client-log-viewer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The agent logs the API kept for one machine (`log.send_latest`). Rendered
 * only for users who may use remote control; the actions re-check it.
 * Fetching a new one happens from the remote-control page, which is where a
 * command is sent from - this card only reads and deletes.
 */
export function ClientLogsCard({ clientId }: { clientId: number }) {
  const t = useTranslations("remote.log");
  const [logs, setLogs] = useState<ClientLogRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ClientLogRecord | null>(null);
  const [deleting, startDeleting] = useTransition();

  const load = useCallback(async () => {
    const r = await listClientLogsAction(clientId);
    if (r.ok) {
      setLogs(r.logs);
      setError(null);
    } else {
      setError(r.error);
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    void listClientLogsAction(clientId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setLogs(r.logs);
        setError(null);
      } else {
        setError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function remove() {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    startDeleting(async () => {
      const r = await deleteClientLogAction(target.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("deleted"));
      if (open === target.id) setOpen(null);
      await load();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {t("storedTitle")}
        </CardTitle>
        <Button variant="ghost" size="icon" aria-label={t("refresh")} onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t.rich("storedHint", {
            link: (chunks) => (
              <Link href="/remote" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {logs === null && !error && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loading")}
          </div>
        )}
        {logs?.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("storedEmpty")}</p>}
        {logs?.map((log) => (
          <div key={log.id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 font-medium"
                aria-expanded={open === log.id}
                onClick={() => setOpen(open === log.id ? null : log.id)}
              >
                {open === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {formatDateTime(log.collected_at ?? log.received_at)}
              </button>
              <span className="text-xs text-muted-foreground">
                {t("included", { included: formatBytes(log.included_bytes), size: formatBytes(log.size_bytes) })}
              </span>
              {log.truncated && <Badge variant="outline">{t("truncatedBadge")}</Badge>}
              {log.updater_version && (
                <span className="font-mono text-xs text-muted-foreground">{log.updater_version}</span>
              )}
              {log.issued_by && <span className="text-xs text-muted-foreground">{log.issued_by}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                aria-label={t("delete")}
                disabled={deleting}
                onClick={() => setConfirm(log)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {open === log.id && (
              <div className="mt-3">
                <ClientLogViewer source={{ kind: "stored", record: log }} />
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", {
                date: confirm ? formatDateTime(confirm.collected_at ?? confirm.received_at) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
