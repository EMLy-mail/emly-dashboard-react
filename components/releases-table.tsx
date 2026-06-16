"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Release, ReleaseChannel } from "@/lib/api";
import { promoteReleaseAction, deleteReleaseAction } from "@/lib/actions/updates";
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
import { MoreHorizontal, ArrowUpCircle, Archive, AlertTriangle, Trash2, Pencil } from "lucide-react";
import { EditReleaseDialog } from "@/components/edit-release-dialog";

function ChannelBadge({ channel }: { channel: ReleaseChannel }) {
  if (channel === "stable") return <Badge>stable</Badge>;
  if (channel === "beta") return <Badge variant="secondary">beta</Badge>;
  return <Badge variant="outline">archived</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "security") return <Badge variant="destructive">security</Badge>;
  if (severity === "bugfix") return <Badge variant="secondary">bugfix</Badge>;
  if (severity === "feature") return <Badge>feature</Badge>;
  return <Badge variant="outline">none</Badge>;
}

export function ReleasesTable({ releases, isAdmin }: { releases: Release[]; isAdmin: boolean }) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Release | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("updates");

  function handlePromote(version: string, channel: ReleaseChannel) {
    startTransition(async () => {
      try {
        await promoteReleaseAction(version, channel);
        toast.success(t("table.promoted", { version, channel }));
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
        await deleteReleaseAction(version);
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
              <TableHead>{t("table.channel")}</TableHead>
              <TableHead>{t("table.severity")}</TableHead>
              <TableHead>{t("table.note")}</TableHead>
              <TableHead>{t("table.critical")}</TableHead>
              <TableHead>{t("table.minRequired")}</TableHead>
              <TableHead>{t("table.released")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {releases.map((release) => (
              <TableRow key={release.version}>
                <TableCell className="font-mono font-medium">{release.version}</TableCell>
                <TableCell>
                  <ChannelBadge channel={release.channel} />
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={release.severity_type} />
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                  {release.short_note || "—"}
                </TableCell>
                <TableCell>
                  {release.is_critical && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {release.min_required_version ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(release.released_at).toLocaleDateString()}
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
                      <DropdownMenuSeparator />
                      {release.channel !== "stable" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "stable")}>
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          {t("table.promoteStable")}
                        </DropdownMenuItem>
                      )}
                      {release.channel !== "beta" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "beta")}>
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          {t("table.promoteBeta")}
                        </DropdownMenuItem>
                      )}
                      {release.channel !== "archived" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "archived")}>
                          <Archive className="mr-2 h-4 w-4" />
                          {t("table.archive")}
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
        <EditReleaseDialog
          release={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.deleteTitle", { version: deleteTarget ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("table.deleteDescription")}
            </AlertDialogDescription>
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
