"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { User } from "@/lib/api";
import { setUserProductsAction } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface AssignableProduct {
  slug: string;
  name: string;
}

/**
 * Checkbox list of the products the acting admin can see. Products the target
 * has but the admin cannot see are listed as fixed badges: the action keeps
 * them as they are, since the admin has no way to know what they are for.
 */
export function ProductCheckboxes({
  idPrefix,
  options,
  selected,
  onChange,
  name,
}: {
  idPrefix: string;
  options: AssignableProduct[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** When set, every checked slug is also submitted as a form field of this name. */
  name?: string;
}) {
  return (
    <div className="space-y-2">
      {options.map((p) => {
        const id = `${idPrefix}-${p.slug}`;
        const checked = selected.includes(p.slug);
        return (
          <div key={p.slug} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id}
              name={name}
              value={p.slug}
              checked={checked}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, p.slug] : selected.filter((s) => s !== p.slug))
              }
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {p.name} <span className="font-mono text-xs text-muted-foreground">{p.slug}</span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}

export function UserProductsDialog({
  user,
  assigned,
  options,
  onClose,
}: {
  user: User;
  assigned: string[];
  options: AssignableProduct[];
  onClose: () => void;
}) {
  const t = useTranslations("users.productsDialog");
  const offered = options.map((p) => p.slug);
  const [selected, setSelected] = useState(assigned.filter((s) => offered.includes(s)));
  const hidden = assigned.filter((s) => !offered.includes(s));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setUserProductsAction(user.id, selected);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(t("saved", { username: user.username }));
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { username: user.username })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOptions")}</p>
          ) : (
            <ProductCheckboxes
              idPrefix={`assign-${user.id}`}
              options={options}
              selected={selected}
              onChange={setSelected}
            />
          )}
          {hidden.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {hidden.map((slug) => (
                  <Badge key={slug} variant="outline" className="font-mono">
                    {slug}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("hiddenKept")}</p>
            </div>
          )}
          {selected.length === 0 && hidden.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("noneWarning")}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
