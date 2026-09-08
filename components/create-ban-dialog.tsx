"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createBanAction } from "@/lib/actions/bans";
import type { BanType } from "@/lib/api";
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
import { Ban as BanIcon, Plus } from "lucide-react";

interface CreateBanDialogProps {
  /** Pre-selects the type and value, for the "ban this machine" buttons on
   *  the client detail page. Omitted on the bans page, where the operator
   *  picks both. */
  defaultType?: BanType;
  defaultValue?: string;
  /** Renders as a small outline button instead of the page's primary one. */
  compact?: boolean;
  label?: string;
}

export function CreateBanDialog({
  defaultType = "ip",
  defaultValue = "",
  compact = false,
  label,
}: CreateBanDialogProps) {
  const [open, setOpen] = useState(false);
  const [banType, setBanType] = useState<BanType>(defaultType);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("bans");

  // The action runs as a plain async form action rather than through
  // useActionState: closing the dialog and raising the toast are things to
  // do *after* the submit resolves, and expressing that here keeps them out
  // of an effect watching a success flag - which would set state during
  // render and cascade.
  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createBanAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success(t("createDialog.success"));
    });
  }

  // Reopening after a prefill change (a different machine on the same page)
  // must not keep the previous selection or a stale error.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setBanType(defaultType);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="outline" size="sm">
            <BanIcon className="mr-2 h-4 w-4" />
            {label ?? t("createBan")}
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("createBan")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {/* Select does not submit natively; the hidden input carries it. */}
          <input type="hidden" name="ban_type" value={banType} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="ban-type">{t("createDialog.type")}</Label>
            <Select value={banType} onValueChange={(v) => setBanType(v as BanType)}>
              <SelectTrigger id="ban-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ip">{t("type.ip")}</SelectItem>
                <SelectItem value="hwid">{t("type.hwid")}</SelectItem>
                <SelectItem value="hostname">{t("type.hostname")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`createDialog.hint.${banType}`)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ban-value">{t("createDialog.value")}</Label>
            <Input
              id="ban-value"
              name="value"
              defaultValue={defaultValue}
              className="font-mono"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ban-reason">{t("createDialog.reason")}</Label>
            <Input id="ban-reason" name="reason" maxLength={500} />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? t("createDialog.submitting") : t("createDialog.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
