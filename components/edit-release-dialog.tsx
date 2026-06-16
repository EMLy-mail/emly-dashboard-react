"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateReleaseAction, type ReleaseActionState } from "@/lib/actions/updates";
import type { Release } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ReleaseActionState = {};

interface EditReleaseDialogProps {
  release: Release;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditReleaseDialog({ release, open, onOpenChange }: EditReleaseDialogProps) {
  const [channel, setChannel] = useState<string>(release.channel);
  const [severityType, setSeverityType] = useState<string>(release.severity_type);
  const [isCritical, setIsCritical] = useState<boolean>(release.is_critical);
  const t = useTranslations("updates");

  const isArchived = channel === "archived";

  const boundAction = updateReleaseAction.bind(null, release.version);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setChannel(release.channel);
      setSeverityType(release.severity_type);
      setIsCritical(release.is_critical);
    }
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
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="severity_type" value={severityType} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("editDialog.channel")}</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archived">{t("editDialog.channelArchived")}</SelectItem>
                  <SelectItem value="beta">{t("editDialog.channelBeta")}</SelectItem>
                  <SelectItem value="stable">{t("editDialog.channelStable")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("editDialog.severity")}</Label>
              <Select value={severityType} onValueChange={setSeverityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("editDialog.severityNone")}</SelectItem>
                  <SelectItem value="bugfix">{t("editDialog.severityBugfix")}</SelectItem>
                  <SelectItem value="feature">{t("editDialog.severityFeature")}</SelectItem>
                  <SelectItem value="security">{t("editDialog.severitySecurity")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-note">{t("editDialog.shortNote")}</Label>
              <Input
                id="edit-note"
                name="short_note"
                defaultValue={release.short_note ?? ""}
                placeholder={t("editDialog.shortNotePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-minver">{t("editDialog.minRequiredVersion")}</Label>
              <Input
                id="edit-minver"
                name="min_required_version"
                defaultValue={release.min_required_version ?? ""}
                placeholder="1.6.0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc-en">{t("editDialog.descriptionEn")}</Label>
            <textarea
              id="edit-desc-en"
              name="description_en"
              rows={3}
              defaultValue={release.description_en ?? ""}
              placeholder={t("editDialog.descriptionEnPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc-it">{t("editDialog.descriptionIt")}</Label>
            <textarea
              id="edit-desc-it"
              name="description_it"
              rows={3}
              defaultValue={release.description_it ?? ""}
              placeholder={t("editDialog.descriptionItPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-critical"
              name="is_critical"
              value="true"
              checked={!isArchived && isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              disabled={isArchived}
              className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Label
              htmlFor="edit-critical"
              className={`font-normal ${isArchived ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}`}
            >
              {t("editDialog.critical")}
            </Label>
          </div>
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
