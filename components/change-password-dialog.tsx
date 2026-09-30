"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  changeOwnPasswordAction,
  type ChangePasswordActionState,
} from "@/lib/actions/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ChangePasswordActionState = {};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: Props) {
  const t = useTranslations("changePassword");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts with an empty
            form and no leftover error. */}
        {open && <ChangePasswordForm onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(changeOwnPasswordAction, initialState);
  const t = useTranslations("changePassword");

  useEffect(() => {
    if (state.success) {
      toast.success(t("success"));
      onClose();
    }
  }, [state.success, onClose, t]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="current-password">{t("currentPassword")}</Label>
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-own-password">{t("newPassword")}</Label>
        <Input
          id="new-own-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-own-password">{t("confirmPassword")}</Label>
        <Input
          id="confirm-own-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
