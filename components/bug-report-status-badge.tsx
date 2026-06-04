import { Badge } from "@/components/ui/badge";
import type { BugReportStatus } from "@/lib/api";

const statusConfig: Record<
  BugReportStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  new: { label: "New", variant: "default" },
  in_review: { label: "In Review", variant: "secondary" },
  resolved: { label: "Resolved", variant: "outline" },
  closed: { label: "Closed", variant: "outline" },
};

export function BugReportStatusBadge({ status }: { status: BugReportStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
