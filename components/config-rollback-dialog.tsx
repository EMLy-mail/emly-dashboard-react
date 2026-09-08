"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { rollbackConfigAction, type ConfigActionState } from "@/lib/actions/config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ConfigActionState = {};

interface ConfigRollbackDialogProps {
  revision: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigRollbackDialog({ revision, open, onOpenChange }: ConfigRollbackDialogProps) {
  const t = useTranslations("config");
  const [state, formAction, isPending] = useActionState(rollbackConfigAction, initialState);

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
      toast.success(t("rollbackDialog.success", { revision: state.revision ?? 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.revision]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rollbackDialog.title", { revision })}</DialogTitle>
          <DialogDescription>{t("rollbackDialog.description", { revision })}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="to" value={revision} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="rollback-notes">{t("rollbackDialog.notes")}</Label>
            <Input id="rollback-notes" name="notes" placeholder={t("rollbackDialog.notesPlaceholder")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("rollbackDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("rollbackDialog.rollingBack") : t("rollbackDialog.confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
