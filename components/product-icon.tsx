import { createElement } from "react";
import { BrandMark } from "@/components/brand-mark";
import { productIcon } from "@/lib/product-icons";
import { EMLY_PRODUCT } from "@/lib/product-rules";
import { cn } from "@/lib/utils";

/** A product's mark: EMLy's own logo, the hand-picked Lucide icon otherwise. */
export function ProductIcon({ slug, className }: { slug: string; className?: string }) {
  if (slug === EMLY_PRODUCT) {
    return <BrandMark src="/emly-logo.png" className={cn("h-4 w-4 bg-current", className)} />;
  }
  // createElement, not <Icon />: the icon is looked up per slug, and a
  // component resolved during render trips react-hooks/static-components.
  return createElement(productIcon(slug), {
    "aria-hidden": true,
    className: cn("h-4 w-4 shrink-0", className),
  });
}
