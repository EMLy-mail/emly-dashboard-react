"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, FileArchive, Loader2, Search } from "lucide-react";
import type { ClientLogFilePayload, ClientLogRecord } from "@/lib/api";
import { decodeGzipBase64, LOG_LEVELS, parseLogLines, type LogLevel } from "@/lib/client-logs";
import { formatDateTime, formatShortDateTime } from "@/lib/format-date";
import { cn, formatBytes } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Where the text comes from: a fresh `log.send_latest` result still in the
 * command record (decoded right here), or a log the API kept (fetched through
 * the download route).
 */
export type ClientLogSource =
  | { kind: "payload"; logId: string; hostname?: string; payload: ClientLogFilePayload }
  | { kind: "stored"; record: ClientLogRecord };

interface Meta {
  logId: string;
  hostname?: string;
  fileName: string;
  sizeBytes: number;
  includedBytes: number;
  truncated: boolean;
  level?: string;
  collectedAt?: string;
  mismatch?: boolean;
}

function metaOf(source: ClientLogSource): Meta {
  if (source.kind === "payload") {
    const p = source.payload;
    return {
      logId: source.logId,
      hostname: source.hostname,
      fileName: p.name || "updater.log",
      sizeBytes: p.size_bytes,
      includedBytes: p.included_bytes,
      truncated: p.offset > 0,
      level: p.level,
      collectedAt: p.collected_at,
    };
  }
  const r = source.record;
  return {
    logId: r.id,
    hostname: r.hostname,
    fileName: r.file_name || "updater.log",
    sizeBytes: r.size_bytes,
    includedBytes: r.included_bytes,
    truncated: r.truncated,
    level: r.level,
    collectedAt: r.collected_at ?? r.received_at,
    mismatch: r.mismatch,
  };
}

// bar: the stripe at the start of the row; pill: the level badge; row: a tint
// only on what needs attention; text: the message colour.
const LEVEL_STYLE: Record<LogLevel, { bar: string; pill: string; row?: string; text: string }> = {
  DEBUG: {
    bar: "bg-muted-foreground/40",
    pill: "border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground",
    text: "text-muted-foreground",
  },
  INFO: {
    bar: "bg-blue-500",
    pill: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    text: "",
  },
  WARN: {
    bar: "bg-amber-500",
    pill: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    row: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
  },
  ERROR: {
    bar: "bg-red-500",
    pill: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
    row: "bg-red-500/10",
    text: "text-red-700 dark:text-red-300",
  },
};

// The agent writes RFC 3339 with its offset; anything else is shown as written.
function logTime(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : formatShortDateTime(d);
}

/**
 * `fill`: the viewer takes the height its parent (a flex column) gives it and
 * only the lines scroll, instead of capping the lines at a fixed height.
 */
export function ClientLogViewer({ source, fill = false }: { source: ClientLogSource; fill?: boolean }) {
  const t = useTranslations("remote.log");
  const meta = useMemo(() => metaOf(source), [source]);

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set(LOG_LEVELS));
  const [query, setQuery] = useState("");
  const preRef = useRef<HTMLPreElement>(null);

  const payloadContent = source.kind === "payload" ? source.payload.content : null;
  const storedId = source.kind === "stored" ? source.record.id : null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let out: string;
        if (payloadContent !== null) {
          out = await decodeGzipBase64(payloadContent);
        } else {
          const res = await fetch(`/api/client-logs/${storedId}`, { cache: "no-store" });
          if (!res.ok) throw new Error(res.status === 404 ? t("errors.notFound") : t("errors.unavailable"));
          out = await res.text();
        }
        if (!cancelled) setText(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errors.decode"));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [payloadContent, storedId, t]);

  const lines = useMemo(() => (text === null ? [] : parseLogLines(text)), [text]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter(
      (l) => (l.level === null || levels.has(l.level)) && (!q || l.text.toLowerCase().includes(q)),
    );
  }, [lines, levels, query]);

  // Newest lines are at the bottom: that is where a diagnosis starts.
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible]);

  function toggleLevel(level: LogLevel) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  const baseName = `${(meta.hostname || "client").replace(/[^A-Za-z0-9._-]/g, "_")}_${meta.fileName}`;

  function downloadText() {
    if (text === null) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = baseName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(visible.map((l) => l.text).join("\n"));
      toast.success(t("copied"));
    } catch {
      toast.error(t("errors.copy"));
    }
  }

  return (
    <div className={cn(fill ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3" : "space-y-3")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{meta.fileName}</span>
        <span>{t("included", { included: formatBytes(meta.includedBytes), size: formatBytes(meta.sizeBytes) })}</span>
        {meta.collectedAt && <span>{t("collectedAt", { date: formatDateTime(meta.collectedAt) })}</span>}
        {meta.level && <Badge variant="outline">{t("level", { level: meta.level })}</Badge>}
      </div>

      {meta.truncated && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("truncated", { included: formatBytes(meta.includedBytes), size: formatBytes(meta.sizeBytes) })}
          </AlertDescription>
        </Alert>
      )}
      {meta.mismatch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("mismatch")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {LOG_LEVELS.map((level) => (
          <Button
            key={level}
            type="button"
            size="sm"
            variant={levels.has(level) ? "secondary" : "ghost"}
            className={cn("h-7 px-2 font-mono text-xs", levels.has(level) && LEVEL_STYLE[level].text)}
            aria-pressed={levels.has(level)}
            onClick={() => toggleLevel(level)}
          >
            {level}
          </Button>
        ))}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="h-8 pl-8"
          />
        </div>
        <Button type="button" size="sm" variant="outline" disabled={text === null} onClick={() => void copy()}>
          <Copy className="mr-2 h-4 w-4" />
          {t("copy")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={text === null} onClick={downloadText}>
          <Download className="mr-2 h-4 w-4" />
          {t("downloadText")}
        </Button>
        {/* The gzip as the API stored it: only there once the API saved the
            log, which a fresh result normally is within a second. */}
        <Button type="button" size="sm" variant="outline" asChild>
          <a href={`/api/client-logs/${meta.logId}?format=gz`} download>
            <FileArchive className="mr-2 h-4 w-4" />
            {t("downloadGz")}
          </a>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : text === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t("lines", { shown: visible.length, total: lines.length })}
          </p>
          <pre
            ref={preRef}
            className={cn(
              "overflow-auto rounded-md bg-muted p-1.5 font-mono text-xs leading-relaxed",
              fill ? "min-h-0 flex-1" : "max-h-[32rem]",
            )}
          >
            <div className="w-max min-w-full space-y-px">
              {visible.map((l) => {
                const style = l.level ? LEVEL_STYLE[l.level] : null;
                return (
                  <div
                    key={l.n}
                    className={cn("flex items-center gap-3 rounded-sm px-2 py-0.5 whitespace-pre", style?.row)}
                  >
                    <span
                      className={cn("h-4 w-1 shrink-0 rounded-full", style?.bar ?? "bg-muted-foreground/20")}
                      aria-hidden
                    />
                    {l.record ? (
                      <>
                        <span className="w-32 shrink-0 text-muted-foreground">{logTime(l.record.time)}</span>
                        <span
                          className={cn(
                            "w-16 shrink-0 rounded-full border text-center text-[11px] lowercase",
                            style?.pill,
                          )}
                        >
                          {l.level}
                        </span>
                        <span className={style?.text}>
                          {l.record.msg}
                          {l.record.attrs && <span className="ml-3 text-muted-foreground">{l.record.attrs}</span>}
                        </span>
                      </>
                    ) : (
                      // A trace line under a record: indented past the time
                      // and level columns, so it reads as part of it.
                      <span className={cn("pl-[13.5rem]", style?.text)}>{l.text}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </pre>
        </>
      )}
    </div>
  );
}
