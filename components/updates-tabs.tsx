"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, RefreshCw } from "lucide-react";

export interface UpdatesTab {
  /** A product slug, or UPDATER_TAB for the Agent's own self-update. */
  value: string;
  label: string;
}

/**
 * One tab per product the user has, plus the Agent's self-update. The tab
 * lives in `?product=` so the sidebar can link straight to a product, and
 * only the active tab's content is rendered: the page fetches just that one.
 */
export function UpdatesTabs({
  tabs,
  active,
  updaterValue,
  children,
}: {
  tabs: UpdatesTab[];
  active: string;
  updaterValue: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => router.push(`${pathname}?product=${encodeURIComponent(value)}`)}
    >
      <TabsList className="h-auto flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.value === updaterValue ? <RefreshCw /> : <Package />}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={active} className="space-y-6">
        {children}
      </TabsContent>
    </Tabs>
  );
}
