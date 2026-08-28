"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { UpdaterRelease } from "@/lib/api";
import {
  setUpdaterReleaseCurrentAction,
  deleteUpdaterReleaseAction,
} from "@/lib/actions/updates";
import { formatBytes } from "@/lib/utils";
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
import {
  MoreHorizontal,
  ArrowUpCircle,
  PowerOff,
  Download,
  Trash2,
  Pencil,
} from "lucide-react";
import { EditUpdaterReleaseDialog } from "@/components/edit-updater-release-dialog";

interface UpdaterReleasesTableProps {
  releases: UpdaterRelease[];
  isAdmin: boolean;
  /** Public base for the `/v2/updates/download/updater/{version}` links. */
  downloadBaseUrl: string;
}

export function UpdaterReleasesTable({
  releases,
  isAdmin,
  downloadBaseUrl,
}: UpdaterReleasesTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<UpdaterRelease | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("updates.updater");

  function handleSetCurrent(version: string, isCurrent: boolean) {
    startTransition(async () => {
      try {
        await setUpdaterReleaseCurrentAction(version, isCurrent);
        toast.success(t(isCurrent ? "table.promoted" : "table.pulled", { version }));
      } catch {
        toast.error(t("table.promoteFailed"));
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const version = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      try {
        await deleteUpdaterReleaseAction(version);
        toast.success(t("table.deleted", { version }));
      } catch {
        toast.error(t("table.deleteFailed"));
      }
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.version")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.notes")}</TableHead>
              <TableHead>{t("table.size")}</TableHead>
              <TableHead>{t("table.checksum")}</TableHead>
              <TableHead>{t("table.published")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {releases.map((release) => (
              <TableRow key={release.version}>
                <TableCell className="font-mono font-medium">{release.version}</TableCell>
                <TableCell>
                  {release.is_current ? (
                    <Badge>{t("table.current")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("table.archived")}</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                  {release.notes_it || release.notes_en || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatBytes(release.file_size)}
                </TableCell>
                <TableCell
                  className="font-mono text-xs text-muted-foreground"
                  title={release.sha256_checksum}
                >
                  {release.sha256_checksum ? `${release.sha256_checksum.slice(0, 12)}…` : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(release.published_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(release)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("table.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`${downloadBaseUrl}/v2/updates/download/updater/${encodeURIComponent(release.version)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {t("table.download")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {release.is_current ? (
                          <DropdownMenuItem
                            onClick={() => handleSetCurrent(release.version, false)}
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            {t("table.pull")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleSetCurrent(release.version, true)}
                          >
                            <ArrowUpCircle className="mr-2 h-4 w-4" />
                            {t("table.promote")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(release.version)}
                          disabled={isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("table.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editTarget && (
        <EditUpdaterReleaseDialog
          release={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.deleteTitle", { version: deleteTarget ?? "" })}</AlertDialogTitle>
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
