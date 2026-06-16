"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function BugReportSearch({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const t = useTranslations("bugReports");

  const handleSearch = useCallback(
    (term: string) => {
      const params = new URLSearchParams();
      if (term) params.set("search", term);
      params.set("page", "1");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router],
  );

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={t("search.placeholder")}
        defaultValue={defaultValue}
        className="pl-8"
        onChange={(e) => handleSearch(e.target.value)}
      />
    </div>
  );
}
