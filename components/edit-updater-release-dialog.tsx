"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  updateUpdaterReleaseAction,
  type ReleaseActionState,
} from "@/lib/actions/updates";
import type { UpdaterRelease } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ReleaseActionState = {};

/** RFC 3339 -> the local `datetime-local` value the input expects. */
function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface EditUpdaterReleaseDialogProps {
  release: UpdaterRelease;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUpdaterReleaseDialog({
  release,
  open,
  onOpenChange,
}: EditUpdaterReleaseDialogProps) {
  const [isCurrent, setIsCurrent] = useState<boolean>(release.is_current);
  const t = useTranslations("updates.updater");

  const boundAction = updateUpdaterReleaseAction.bind(null, release.version);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setIsCurrent(release.is_current);
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
      toast.success(t("editDialog.success", { version: release.version }));
    }
  }, [state.success, onOpenChange, release.version, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title", { version: release.version })}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="is_current" value={isCurrent ? "true" : "false"} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("editDialog.file")}</span>
              <span className="truncate font-mono">{release.download_filename}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("editDialog.size")}</span>
              <span className="font-mono">{formatBytes(release.file_size)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("editDialog.checksum")}</span>
              <span className="truncate font-mono">{release.sha256_checksum}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-edit-published">{t("editDialog.publishedAt")}</Label>
            <Input
              id="upd-edit-published"
              name="published_at"
              type="datetime-local"
              defaultValue={toDateTimeLocal(release.published_at)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-edit-notes-en">{t("editDialog.notesEn")}</Label>
            <textarea
              id="upd-edit-notes-en"
              name="notes_en"
              rows={3}
              defaultValue={release.notes_en ?? ""}
              placeholder={t("editDialog.notesEnPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-edit-notes-it">{t("editDialog.notesIt")}</Label>
            <textarea
              id="upd-edit-notes-it"
              name="notes_it"
              rows={3}
              defaultValue={release.notes_it ?? ""}
              placeholder={t("editDialog.notesItPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("notesHelp")}</p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="upd-edit-current"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="upd-edit-current" className="cursor-pointer font-normal">
              {t("editDialog.current")}
            </Label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("currentHelp")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("editDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("editDialog.saving") : t("editDialog.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
