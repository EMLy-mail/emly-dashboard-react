"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { User } from "@/lib/api";
import { resetPasswordAction, type UserActionState } from "@/lib/actions/users";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  user: User | null;
  onClose: () => void;
}

const initialState: UserActionState = {};

export function ResetPasswordDialog({ user, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);
  const t = useTranslations("users");

  useEffect(() => {
    if (state.success) {
      toast.success(t("resetPassword.success"));
      onClose();
    }
  }, [state.success, onClose, t]);

  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetPassword.title", { username: user?.username ?? "" })}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={user?.id ?? ""} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="reset-password">{t("resetPassword.newPassword")}</Label>
            <Input id="reset-password" name="password" type="password" required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("resetPassword.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("resetPassword.resetting") : t("resetPassword.reset")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
