"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATS_PRODUCT_ALL, STATS_PRODUCT_UPDATER } from "@/lib/product-rules";

/**
 * The stats `?product=` filter: the user's own products, plus the Agent's
 * self-update and "all" (the user's products and the self-update together).
 */
export function StatsProductFilter({
  value,
  products,
}: {
  value: string;
  products: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("statistics.productFilter");

  function select(product: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", product);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={select}>
      <SelectTrigger size="sm" className="w-44" aria-label={t("label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {products.map((p) => (
          <SelectItem key={p.slug} value={p.slug}>
            {p.name}
          </SelectItem>
        ))}
        <SelectItem value={STATS_PRODUCT_UPDATER}>{t("updater")}</SelectItem>
        <SelectItem value={STATS_PRODUCT_ALL}>{t("all")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
