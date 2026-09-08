"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createUpdaterReleaseAction,
  type ReleaseActionState,
} from "@/lib/actions/updates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";

const initialState: ReleaseActionState = {};

export function CreateUpdaterReleaseDialog() {
  const [open, setOpen] = useState(false);
  const [isCurrent, setIsCurrent] = useState(true);
  const [state, formAction, isPending] = useActionState(
    createUpdaterReleaseAction,
    initialState,
  );
  const t = useTranslations("updates.updater");

  useEffect(() => {
    if (state.success) {
      const frame = requestAnimationFrame(() => setOpen(false));
      toast.success(t("createDialog.success"));

      return () => cancelAnimationFrame(frame);
    }
  }, [state.success, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("newRelease")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="is_current" value={isCurrent ? "true" : "false"} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="upd-version">{t("createDialog.version")}</Label>
              <Input id="upd-version" name="version" placeholder="1.5.0" required />
              <p className="text-xs text-muted-foreground">
                {t("createDialog.versionHelp")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upd-published">{t("createDialog.publishedAt")}</Label>
              <Input id="upd-published" name="published_at" type="datetime-local" />
              <p className="text-xs text-muted-foreground">
                {t("createDialog.publishedAtHelp")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-file">{t("createDialog.installerFile")}</Label>
            <Input
              id="upd-file"
              name="file"
              type="file"
              accept=".exe"
              required
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">{t("createDialog.checksumNote")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-notes-en">{t("createDialog.notesEn")}</Label>
            <textarea
              id="upd-notes-en"
              name="notes_en"
              rows={2}
              placeholder={t("createDialog.notesEnPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upd-notes-it">{t("createDialog.notesIt")}</Label>
            <textarea
              id="upd-notes-it"
              name="notes_it"
              rows={2}
              placeholder={t("createDialog.notesItPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("notesHelp")}</p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="upd-current"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="upd-current" className="cursor-pointer font-normal">
              {t("createDialog.current")}
            </Label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("currentHelp")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("createDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("createDialog.creating") : t("createDialog.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
