"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, RefreshCw } from "lucide-react";

export function UpdatesTabs({ emly, updater }: { emly: ReactNode; updater: ReactNode }) {
  const t = useTranslations("updates.tabs");

  return (
    <Tabs defaultValue="emly">
      <TabsList>
        <TabsTrigger value="emly">
          <Package />
          {t("emly")}
        </TabsTrigger>
        <TabsTrigger value="updater">
          <RefreshCw />
          {t("updater")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="emly" className="space-y-6">
        {emly}
      </TabsContent>
      <TabsContent value="updater" className="space-y-6">
        {updater}
      </TabsContent>
    </Tabs>
  );
}
