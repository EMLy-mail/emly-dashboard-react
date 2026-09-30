"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import {
  createProductAction,
  updateProductAction,
  type ProductActionState,
} from "@/lib/actions/products";
import { checkProductSlug, PRODUCT_NAME_MAX } from "@/lib/product-rules";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: ProductActionState = {};

/** The fields of a product the form edits; absent for a new product. */
export interface ProductFormValues {
  slug: string;
  name: string;
  s3_prefix?: string | null;
  enabled: boolean;
}

/**
 * Create (no `product`) or edit form for a registry product. The slug is
 * fixed at creation - it is written into every release, event and inventory
 * row - so in edit mode it is shown, never editable.
 */
export function ProductFormDialog({
  product,
  open,
  onOpenChange,
}: {
  product?: ProductFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!product;
  const t = useTranslations("products.form");
  const action = isEdit ? updateProductAction.bind(null, product.slug) : createProductAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Each action result is handled once, by identity, not on every re-render.
  const handledState = useRef(state);

  const [slug, setSlug] = useState(product?.slug ?? "");
  const [s3Prefix, setS3Prefix] = useState(product?.s3_prefix ?? "");
  const [enabled, setEnabled] = useState(product?.enabled ?? true);

  // Closing goes through the parent's state, so it must happen after render,
  // not while this component renders.
  useEffect(() => {
    if (handledState.current === state) return;
    handledState.current = state;
    if (!state.success) return;
    onOpenChange(false);
    toast.success(isEdit ? t("updated", { slug: product.slug }) : t("created", { slug }));
  }, [state, onOpenChange, isEdit, product, slug, t]);

  // Checked as the user types so the rule is visible before submitting; the
  // action re-checks, and the API has the last word.
  const slugProblem = !isEdit && slug ? checkProductSlug(slug) : null;
  const prefixChanged = isEdit && s3Prefix.trim() !== (product.s3_prefix ?? "");
  const errorText = state.errorCode ? t(`errors.${state.errorCode}`) : state.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle", { slug: product.slug }) : t("createTitle")}</DialogTitle>
          {!isEdit && <DialogDescription>{t("createDescription")}</DialogDescription>}
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
          {errorText && (
            <Alert variant="destructive">
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="product-slug">{t("slug")}</Label>
            {isEdit ? (
              <Input id="product-slug" value={product.slug} disabled readOnly className="font-mono" />
            ) : (
              <Input
                id="product-slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="foo"
                maxLength={20}
                required
                autoComplete="off"
                className="font-mono"
                aria-invalid={!!slugProblem}
              />
            )}
            <p className={`text-xs ${slugProblem ? "text-destructive" : "text-muted-foreground"}`}>
              {slugProblem === "format"
                ? t("errors.slugFormat")
                : slugProblem === "reserved"
                  ? t("errors.slugReserved")
                  : t("slugHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-name">{t("name")}</Label>
            <Input
              id="product-name"
              name="name"
              defaultValue={product?.name ?? ""}
              maxLength={PRODUCT_NAME_MAX}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-s3">{t("s3Prefix")}</Label>
            <Input
              id="product-s3"
              name="s3_prefix"
              value={s3Prefix}
              onChange={(e) => setS3Prefix(e.target.value)}
              placeholder={t("s3PrefixPlaceholder")}
              className="font-mono"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("s3PrefixHelp")}</p>
            {isEdit && prefixChanged && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{t("s3PrefixWarning")}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="product-enabled">{t("enabled")}</Label>
              <p className="text-xs text-muted-foreground">{t("enabledHelp")}</p>
            </div>
            <Switch id="product-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !!slugProblem}>
              {isPending ? t("saving") : isEdit ? t("save") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
