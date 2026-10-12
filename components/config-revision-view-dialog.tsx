"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getConfigRevisionAction } from "@/lib/actions/config";
import type { RemoteConfigRevisionSummary } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PayloadViewer } from "@/components/payload-viewer";
import { Loader2 } from "lucide-react";

interface ConfigRevisionViewDialogProps {
  revision: RemoteConfigRevisionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigRevisionViewDialog({ revision, open, onOpenChange }: ConfigRevisionViewDialogProps) {
  const t = useTranslations("config");
  // undefined while loading: null is a value a document could hold.
  const [configDoc, setConfigDoc] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // No reset-to-null here: the parent only mounts this dialog while
    // viewTarget is set and unmounts it on close (`{viewTarget && <.../>}`),
    // so a fresh open is always a fresh mount and configDoc/error already
    // start at their null initial state.
    let cancelled = false;

    getConfigRevisionAction(revision.revision)
      .then((full) => {
        if (cancelled) return;
        setConfigDoc(parseDocument(full.document));
      })
      .catch(() => {
        if (!cancelled) setError(t("viewDialog.loadFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [open, revision.revision, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("viewDialog.title", { revision: revision.revision })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant={revision.status === "published" ? "default" : revision.status === "draft" ? "secondary" : "outline"}>
            {t(`status.${revision.status}`)}
          </Badge>
          <span>{t("viewDialog.etag")}: <span className="font-mono">{revision.etag.slice(0, 12)}…</span></span>
          {revision.based_on != null && <span>{t("viewDialog.basedOn", { revision: revision.based_on })}</span>}
          {revision.created_by && <span>{t("viewDialog.createdBy", { user: revision.created_by })}</span>}
        </div>
        {revision.notes && <p className="text-sm text-muted-foreground">{revision.notes}</p>}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && configDoc === undefined && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {configDoc !== undefined && (
          // The tree is the one thing that scrolls: its cap is the dialog's
          // 90vh minus the header, metadata and the viewer's own toolbar.
          <PayloadViewer data={configDoc} rootName="document" maxHeight="calc(90vh - 15rem)" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Some revisions come back as a JSON string; the tree wants the value. */
function parseDocument(document: unknown): unknown {
  if (typeof document !== "string") return document;
  try {
    return JSON.parse(document);
  } catch {
    return document;
  }
}
