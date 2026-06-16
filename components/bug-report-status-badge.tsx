"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { BugReportStatus } from "@/lib/api";

const variantMap: Record<BugReportStatus, "default" | "secondary" | "destructive" | "outline"> = {
  new: "default",
  in_review: "secondary",
  resolved: "outline",
  closed: "outline",
};

export function BugReportStatusBadge({ status }: { status: BugReportStatus }) {
  const t = useTranslations("bugReports");
  return <Badge variant={variantMap[status]}>{t(`status.${status}`)}</Badge>;
}
