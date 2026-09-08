"use client";

import { useTranslations } from "next-intl";
import { useStatsLive } from "@/hooks/use-stats-stream";
import { Badge } from "@/components/ui/badge";

export function StatsLiveBadge() {
  const t = useTranslations("statistics.live");
  const live = useStatsLive();

  return <Badge variant={live ? "outline" : "secondary"}>{live ? t("on") : t("off")}</Badge>;
}
