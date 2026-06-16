"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import type { BugReportListItem } from "@/lib/api";
import { deleteReportAction } from "@/lib/actions/bug-reports";
import { BugReportStatusBadge } from "./bug-report-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Eye } from "lucide-react";

interface BugReportsTableProps {
  data: BugReportListItem[] | null;
  totalPages: number;
  currentPage: number;
  search?: string;
  isAdmin: boolean;
}

export function BugReportsTable({ data: rawData, totalPages, currentPage, search, isAdmin }: BugReportsTableProps) {
  const data = rawData ?? [];
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("bugReports");

  function navigatePage(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search) params.set("search", search);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteReportAction(id);
      toast.success(t("table.deleted"));
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("table.id")}</TableHead>
              <TableHead>{t("table.reporter")}</TableHead>
              <TableHead>{t("table.description")}</TableHead>
              <TableHead>{t("table.hostname")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.files")}</TableHead>
              <TableHead>{t("table.date")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {data.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-mono text-sm">#{report.id}</TableCell>
                <TableCell>
                  <div className="font-medium">{report.name}</div>
                  <div className="text-xs text-muted-foreground">{report.email}</div>
                </TableCell>
                <TableCell className="max-w-xs">
                  <Link
                    href={`/bug-reports/${report.id}`}
                    className="truncate block hover:underline"
                  >
                    {report.description}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-sm">{report.hostname}</TableCell>
                <TableCell>
                  <BugReportStatusBadge status={report.status} />
                </TableCell>
                <TableCell>{report.file_count}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(report.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/bug-reports/${report.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          {t("table.viewDetails")}
                        </Link>
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(report.id)}
                          disabled={isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("table.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("table.page", { current: currentPage, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => navigatePage(currentPage - 1)}
            >
              {t("table.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => navigatePage(currentPage + 1)}
            >
              {t("table.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
