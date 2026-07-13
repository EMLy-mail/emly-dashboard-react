"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createReleaseAction, type ReleaseActionState } from "@/lib/actions/updates";
import type { ReleaseProduct } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";

const initialState: ReleaseActionState = {};

export function CreateReleaseDialog({ product }: { product: ReleaseProduct }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("archived");
  const [severityType, setSeverityType] = useState("none");
  const [isCritical, setIsCritical] = useState(false);
  const boundAction = createReleaseAction.bind(null, product);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);
  const t = useTranslations("updates");

  const isArchived = channel === "archived";

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
          {/* hidden inputs carry Select values since Select doesn't submit natively */}
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="severity_type" value={severityType} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rel-version">{t("createDialog.version")}</Label>
              <Input id="rel-version" name="version" placeholder="1.7.5" required />
            </div>
            <div className="space-y-2">
              <Label>{t("createDialog.channel")}</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archived">{t("createDialog.channelArchived")}</SelectItem>
                  <SelectItem value="beta">{t("createDialog.channelBeta")}</SelectItem>
                  <SelectItem value="stable">{t("createDialog.channelStable")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-file">{t("createDialog.installerFile")}</Label>
            <Input
              id="rel-file"
              name="file"
              type="file"
              accept=".exe"
              required
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              {t("createDialog.checksumNote")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("createDialog.severity")}</Label>
              <Select value={severityType} onValueChange={setSeverityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("createDialog.severityNone")}</SelectItem>
                  <SelectItem value="bugfix">{t("createDialog.severityBugfix")}</SelectItem>
                  <SelectItem value="feature">{t("createDialog.severityFeature")}</SelectItem>
                  <SelectItem value="security">{t("createDialog.severitySecurity")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rel-minver">{t("createDialog.minRequiredVersion")}</Label>
              <Input id="rel-minver" name="min_required_version" placeholder="1.6.0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-note">{t("createDialog.shortNote")}</Label>
            <Input id="rel-note" name="short_note" placeholder={t("createDialog.shortNotePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-desc-en">{t("createDialog.descriptionEn")}</Label>
            <textarea
              id="rel-desc-en"
              name="description_en"
              rows={2}
              placeholder={t("createDialog.descriptionEnPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rel-desc-it">{t("createDialog.descriptionIt")}</Label>
            <textarea
              id="rel-desc-it"
              name="description_it"
              rows={2}
              placeholder={t("createDialog.descriptionItPlaceholder")}
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rel-critical"
              name="is_critical"
              value="true"
              checked={!isArchived && isCritical}
              onChange={(e) => setIsCritical(e.target.checked)}
              disabled={isArchived}
              className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Label
              htmlFor="rel-critical"
              className={`font-normal ${isArchived ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}`}
            >
              {t("createDialog.critical")}
            </Label>
          </div>
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
