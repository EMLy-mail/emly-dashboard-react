"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getConfigRevisionAction } from "@/lib/actions/config";
import type { RemoteConfigRevisionSummary } from "@/lib/api";
import { formatConfigDocument } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConfigJsonTextarea } from "@/components/config-json-textarea";
import { Loader2 } from "lucide-react";

interface ConfigRevisionViewDialogProps {
  revision: RemoteConfigRevisionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigRevisionViewDialog({ revision, open, onOpenChange }: ConfigRevisionViewDialogProps) {
  const t = useTranslations("config");
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // No reset-to-null here: the parent only mounts this dialog while
    // viewTarget is set and unmounts it on close (`{viewTarget && <.../>}`),
    // so a fresh open is always a fresh mount and documentText/error already
    // start at their null initial state.
    let cancelled = false;

    getConfigRevisionAction(revision.revision)
      .then((full) => {
        if (cancelled) return;
        setDocumentText(formatConfigDocument(full.document));
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
        {!error && documentText === null && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {documentText !== null && (
          <ConfigJsonTextarea value={documentText} readOnly rows={20} className="cursor-text" />
        )}
      </DialogContent>
    </Dialog>
  );
}
