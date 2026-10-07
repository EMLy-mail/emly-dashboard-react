"use client";

import { useState, useActionState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createUserAction, type CreateUserActionState } from "@/lib/actions/users";
import { ProductCheckboxes, type AssignableProduct } from "@/components/user-products-dialog";
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

const initialState: CreateUserActionState = {};

/**
 * `assignableProducts` is null when the actor cannot assign products (only
 * admins and owners can); the dialog then only warns that the new user will
 * see nothing until an admin assigns them some.
 */
export function CreateUserDialog({ assignableProducts }: { assignableProducts: AssignableProduct[] | null }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("user");
  const [products, setProducts] = useState<string[]>([]);
  const t = useTranslations("users");
  // The outcome is handled inside the action, which runs once per submission,
  // not during render: React may replay a render several times before
  // committing it (while the action is pending and the page revalidates), and
  // every replay used to fire another toast.
  const [state, formAction, isPending] = useActionState(
    async (prev: CreateUserActionState, formData: FormData) => {
      const result = await createUserAction(prev, formData);
      if (result.success) {
        setOpen(false);
        setProducts([]);
        toast.success(t("createDialog.success"));
        if (result.productsError) {
          toast.error(t("createDialog.productsFailed", { error: result.productsError }));
        }
      }
      return result;
    },
    initialState,
  );

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
          <div className="space-y-2">
            <Label>{t("createDialog.products")}</Label>
            {assignableProducts && assignableProducts.length > 0 && (
              <ProductCheckboxes
                idPrefix="new-user-product"
                name="products"
                options={assignableProducts}
                selected={products}
                onChange={setProducts}
              />
            )}
            {products.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {assignableProducts ? t("createDialog.noProductsHint") : t("createDialog.noProductsHintNoAssign")}
              </p>
            )}
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
