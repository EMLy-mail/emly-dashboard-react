"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReleaseProduct } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function UpdatesProductTabs({ product }: { product: ReleaseProduct }) {
  const router = useRouter();
  const t = useTranslations("updates");

  return (
    <Tabs
      value={product}
      onValueChange={(value) => router.push(`/updates?product=${value}`)}
    >
      <TabsList>
        <TabsTrigger value="app">{t("tabs.app")}</TabsTrigger>
        <TabsTrigger value="updater">{t("tabs.updater")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
