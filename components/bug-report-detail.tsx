"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import type { BugReport, BugReportFile, BugReportStatus } from "@/lib/api";
import { updateStatusAction, deleteReportAction } from "@/lib/actions/bug-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Mail,
  HardDrive,
  FileCode,
  FileIcon,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

async function triggerDownload(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ROLE_ICONS: Record<BugReportFile["file_role"], React.ElementType> = {
  screenshot: ImageIcon,
  mail_file: Mail,
  localstorage: HardDrive,
  config: FileCode,
};

// ── JSON syntax highlighter ────────────────────────────────────────────────

function JsonViewer({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data, null, 2);
  const tokens: React.ReactNode[] = [];
  const regex =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],]|:|\s+)/g;

  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(json)) !== null) {
    if (m.index > last) tokens.push(json.slice(last, m.index));

    const t = m[0];
    let cls = "";
    if (/^\s/.test(t)) {
      tokens.push(t);
      last = regex.lastIndex;
      continue;
    }
    if (/^"/.test(t)) {
      cls = /:$/.test(t)
        ? "text-blue-500 dark:text-blue-400"
        : "text-green-600 dark:text-green-500";
    } else if (t === "true" || t === "false") {
      cls = "text-purple-500 dark:text-purple-400";
    } else if (t === "null") {
      cls = "text-muted-foreground";
    } else if (/^-?\d/.test(t)) {
      cls = "text-orange-500 dark:text-orange-400";
    }

    tokens.push(
      cls ? (
        <span key={i++} className={cls}>
          {t}
        </span>
      ) : (
        t
      ),
    );
    last = regex.lastIndex;
  }
  if (last < json.length) tokens.push(json.slice(last));

  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed">
      {tokens}
    </pre>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: BugReportStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In Review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

interface Props {
  report: BugReport;
  files: BugReportFile[];
  reportId: number;
  isAdmin: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function BugReportDetail({ report, files, reportId, isAdmin }: Props) {
  const [status, setStatus] = useState<BugReportStatus>(report.status);
  const [isPending, startTransition] = useTransition();
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  async function handleZipDownload() {
    setDownloadingZip(true);
    try {
      await triggerDownload(`/api/bug-reports/${reportId}/download`, `report-${reportId}.zip`);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloadingZip(false);
    }
  }

  async function handleFileDownload(file: BugReportFile) {
    setDownloadingFileId(file.id);
    try {
      await triggerDownload(`/api/bug-reports/${reportId}/files/${file.id}`, file.filename);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloadingFileId(null);
    }
  }

  function handleStatusChange(newStatus: BugReportStatus) {
    setStatus(newStatus);
    startTransition(async () => {
      await updateStatusAction(reportId, newStatus);
      toast.success(`Status updated to "${newStatus.replace("_", " ")}"`);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteReportAction(reportId);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/bug-reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Bug Report #{reportId}</h1>
            <p className="text-muted-foreground">Submitted by {report.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleZipDownload} disabled={downloadingZip}>
            {downloadingZip ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download ZIP
          </Button>

          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete bug report #{reportId}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The report and all its attached files will be
                    permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reporter Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "Name", value: report.name },
              { label: "Email", value: report.email },
              { label: "HWID", value: report.hwid, mono: true },
              { label: "Hostname", value: report.hostname, mono: true },
              { label: "OS User", value: report.os_user },
              { label: "IP", value: report.submitter_ip, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <span className={mono ? "font-mono text-xs" : "truncate"}>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status & Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Current Status</p>
              <Select
                value={status}
                onValueChange={(v) => handleStatusChange(v as BugReportStatus)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(report.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(report.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{report.description}</p>
        </CardContent>
      </Card>

      {/* System info */}
      {report.system_info && (
        <Card>
          <CardHeader>
            <CardTitle>System Info</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={report.system_info} />
          </CardContent>
        </Card>
      )}

      {/* Files */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attached Files ({files.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => {
                const RoleIcon = FILE_ROLE_ICONS[file.file_role] ?? FileIcon;
                const isDownloading = downloadingFileId === file.id;
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <RoleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <button
                          onClick={() => handleFileDownload(file)}
                          disabled={isDownloading}
                          className="text-sm font-medium hover:underline text-left disabled:opacity-50"
                        >
                          {file.filename}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {file.file_role} · {file.mime_type} · {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFileDownload(file)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
