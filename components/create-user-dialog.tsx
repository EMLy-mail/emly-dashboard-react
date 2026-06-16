"use client";

import { useState, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createUserAction, type UserActionState } from "@/lib/actions/users";
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

const initialState: UserActionState = {};

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("user");
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);
  const t = useTranslations("users");

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      toast.success(t("createDialog.success"));
    }
  }, [state.success, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("createUser")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {/* hidden input carries the role value since Select doesn't submit natively */}
          <input type="hidden" name="role" value={role} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-username">{t("createDialog.username")}</Label>
            <Input id="new-username" name="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-displayname">{t("createDialog.displayName")}</Label>
            <Input id="new-displayname" name="displayname" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("createDialog.password")}</Label>
            <Input id="new-password" name="password" type="password" required />
          </div>
          <div className="space-y-2">
            <Label>{t("createDialog.role")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t("createDialog.roleUser")}</SelectItem>
                <SelectItem value="admin">{t("createDialog.roleAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
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
