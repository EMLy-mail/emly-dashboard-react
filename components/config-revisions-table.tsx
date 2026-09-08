"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { RemoteConfigRevisionSummary, RemoteConfigStatus } from "@/lib/api";
import { publishConfigRevisionAction, deleteConfigRevisionAction } from "@/lib/actions/config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Eye, UploadCloud, RotateCcw, Trash2 } from "lucide-react";
import { ConfigRevisionViewDialog } from "@/components/config-revision-view-dialog";
import { ConfigRollbackDialog } from "@/components/config-rollback-dialog";

function StatusBadge({ status }: { status: RemoteConfigStatus }) {
  const t = useTranslations("config");
  if (status === "published") return <Badge>{t("status.published")}</Badge>;
  if (status === "draft") return <Badge variant="secondary">{t("status.draft")}</Badge>;
  return <Badge variant="outline">{t("status.superseded")}</Badge>;
}

interface ConfigRevisionsTableProps {
  revisions: RemoteConfigRevisionSummary[];
  totalPages: number;
  currentPage: number;
  status?: string;
  isAdmin: boolean;
}

export function ConfigRevisionsTable({
  revisions,
  totalPages,
  currentPage,
  status,
  isAdmin,
}: ConfigRevisionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [viewTarget, setViewTarget] = useState<RemoteConfigRevisionSummary | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const t = useTranslations("config");

  function navigatePage(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (status) params.set("status", status);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePublish(revision: number) {
    startTransition(async () => {
      try {
        await publishConfigRevisionAction(revision);
        toast.success(t("table.published", { revision }));
      } catch {
        toast.error(t("table.publishFailed"));
      }
    });
  }

  function confirmDelete() {
    if (deleteTarget == null) return;
    const revision = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      try {
        await deleteConfigRevisionAction(revision);
        toast.success(t("table.deleted", { revision }));
      } catch {
        toast.error(t("table.deleteFailed"));
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.revision")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.notes")}</TableHead>
                <TableHead>{t("table.createdBy")}</TableHead>
                <TableHead>{t("table.basedOn")}</TableHead>
                <TableHead>{t("table.generatedAt")}</TableHead>
                <TableHead>{t("table.clients")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t("table.noData")}
                  </TableCell>
                </TableRow>
              )}
              {revisions.map((r) => (
                <TableRow key={r.revision}>
                  <TableCell className="font-mono font-medium">#{r.revision}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                    {r.notes || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.created_by || t("table.anonymous")}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {r.based_on != null ? `#${r.based_on}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.generated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{r.clients_on_revision}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewTarget(r)}>
                          <Eye className="mr-2 h-4 w-4" />
                          {t("table.view")}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            {r.status === "draft" && (
                              <DropdownMenuItem onClick={() => handlePublish(r.revision)}>
                                <UploadCloud className="mr-2 h-4 w-4" />
                                {t("table.publish")}
                              </DropdownMenuItem>
                            )}
                            {r.status !== "draft" && (
                              <DropdownMenuItem onClick={() => setRollbackTarget(r.revision)}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {t("table.rollbackToThis")}
                              </DropdownMenuItem>
                            )}
                            {r.status === "draft" && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget(r.revision)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("table.delete")}
                              </DropdownMenuItem>
                            )}
                          </>
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

      {viewTarget && (
        <ConfigRevisionViewDialog
          revision={viewTarget}
          open={!!viewTarget}
          onOpenChange={(open) => {
            if (!open) setViewTarget(null);
          }}
        />
      )}

      {rollbackTarget != null && (
        <ConfigRollbackDialog
          revision={rollbackTarget}
          open={rollbackTarget != null}
          onOpenChange={(open) => {
            if (!open) setRollbackTarget(null);
          }}
        />
      )}

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.deleteTitle", { revision: deleteTarget ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t("table.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("table.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t("table.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
