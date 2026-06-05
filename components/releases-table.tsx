"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { MoreHorizontal, ArrowUpCircle, Archive, AlertTriangle, Trash2 } from "lucide-react";

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

export function ReleasesTable({ releases }: { releases: Release[] }) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePromote(version: string, channel: ReleaseChannel) {
    startTransition(async () => {
      try {
        await promoteReleaseAction(version, channel);
        toast.success(`${version} moved to ${channel}`);
      } catch {
        toast.error("Failed to update channel");
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
        toast.success(`Release ${version} deleted`);
      } catch {
        toast.error("Failed to delete release");
      }
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Critical</TableHead>
              <TableHead>Min Required</TableHead>
              <TableHead>Released</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No releases found.
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isPending}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {release.channel !== "stable" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "stable")}>
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          Promote to Stable
                        </DropdownMenuItem>
                      )}
                      {release.channel !== "beta" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "beta")}>
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          Promote to Beta
                        </DropdownMenuItem>
                      )}
                      {release.channel !== "archived" && (
                        <DropdownMenuItem onClick={() => handlePromote(release.version, "archived")}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget(release.version)}
                        disabled={isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete release "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the release record and delete the installer file from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
