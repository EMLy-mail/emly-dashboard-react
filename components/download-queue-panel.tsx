"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Power, RotateCcw, Square, Turtle, XCircle } from "lucide-react";
import type { DownloadQueueSettings, DownloadQueueSlot, DownloadQueueState } from "@/lib/api";
import {
  evictAllDownloadQueueSlotsAction,
  evictDownloadQueueSlotAction,
  getDownloadQueueAction,
  resetDownloadQueueAction,
  updateDownloadQueueAction,
} from "@/lib/actions/download-queue";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// The spec asks for 5 s on this page and no polling anywhere else.
const POLL_MS = 5_000;
const CLOCK_MS = 1_000;
const CAPACITY_STEPS = [10, 50] as const;
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 10000;
const RETRY_AFTER_MIN = 1;
const RETRY_AFTER_MAX = 86400;
const DOWNLOAD_TIMEOUT_MIN = 1;
const DOWNLOAD_TIMEOUT_MAX = 86400;
/** Below this average a client is flagged as slow. */
const SLOW_BYTES_PER_SEC = 100 * 1024;
// The average includes the lookup before the first byte, so every download
// looks slow at first: don't flag anyone before this.
const SLOW_GRACE_SECONDS = 10;

// Known failed_by_reason keys → message keys. Anything else is shown raw.
const FAIL_REASON_KEYS: Record<string, string> = {
  "server timeout": "serverTimeout",
  "client disconnected": "clientDisconnected",
  "copy failed": "copyFailed",
  "error response": "errorResponse",
  "internal error": "internalError",
};

type LoadError = { status?: number; message: string };
type Field = "capacity" | "retry" | "timeout";

type Confirm =
  | { kind: "capacity"; capacity: number }
  | { kind: "evict"; slot: DownloadQueueSlot }
  | { kind: "evictAll"; count: number };

function isModified(state: DownloadQueueState) {
  const d = state.defaults;
  return (
    state.enabled !== d.enabled ||
    state.capacity !== d.capacity ||
    state.retry_after_seconds !== d.retry_after_seconds ||
    state.download_timeout_seconds !== d.download_timeout_seconds
  );
}

/** Seconds → minutes for the input, without trailing noise ("10", "5.5"). */
function secondsToMinutes(seconds: number) {
  return String(Math.round((seconds / 60) * 100) / 100);
}

export function DownloadQueuePanel({
  initialState,
  initialError,
  renderedAt,
}: {
  initialState: DownloadQueueState | null;
  initialError: LoadError | null;
  renderedAt: number;
}) {
  const t = useTranslations("downloadQueue");
  const format = useFormatter();
  const [state, setState] = useState(initialState);
  const [loadError, setLoadError] = useState(initialError);
  const [now, setNow] = useState(renderedAt);
  // null = show the live value; a string = the admin is typing.
  const [capacityDraft, setCapacityDraft] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<string | null>(null);
  const [timeoutDraft, setTimeoutDraft] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [isPending, startTransition] = useTransition();

  const describeError = useCallback(
    (e: LoadError) => {
      if (e.status === 401) return t("errors.unauthorized");
      if (e.status === 503) return t("errors.unavailable");
      return e.message;
    },
    [t],
  );

  // ── Polling ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const r = await getDownloadQueueAction();
    if (r.ok) {
      setState(r.state);
      setLoadError(null);
    } else {
      setLoadError({ status: r.status, message: r.error });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      // No point hitting the API for a tab nobody is looking at.
      if (document.visibilityState !== "visible") return;
      const r = await getDownloadQueueAction();
      if (cancelled) return;
      if (r.ok) {
        setState(r.state);
        setLoadError(null);
      } else {
        setLoadError({ status: r.status, message: r.error });
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!state) {
    return (
      <div className="space-y-4">
        <RestartNotice />
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {loadError ? describeError(loadError) : t("errors.generic")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const current = state;
  const modified = isModified(current);

  // ── Formatting ───────────────────────────────────────────────────────────
  const oneDecimal = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const mb = (bytes: number) => oneDecimal(bytes / (1024 * 1024));
  const speed = (bps: number) =>
    bps >= 1024 * 1024
      ? t("units.mbps", { value: oneDecimal(bps / (1024 * 1024)) })
      : t("units.kbps", { value: oneDecimal(bps / 1024) });
  const duration = (seconds: number) => formatDuration(seconds, t);

  // ── Mutations ────────────────────────────────────────────────────────────
  function setFieldError(field: Field, message: string | null) {
    setFieldErrors((prev) => ({ ...prev, [field]: message ?? undefined }));
  }

  function clearDraft(field: Field) {
    if (field === "capacity") setCapacityDraft(null);
    if (field === "retry") setRetryDraft(null);
    if (field === "timeout") setTimeoutDraft(null);
    setFieldError(field, null);
  }

  function patch(data: Partial<DownloadQueueSettings>, field?: Field) {
    startTransition(async () => {
      const r = await updateDownloadQueueAction(data);
      if (!r.ok) {
        if (r.status === 400 && field) setFieldError(field, r.error);
        else toast.error(describeError({ status: r.status, message: r.error }));
        return;
      }
      setState(r.state);
      setLoadError(null);
      if (field) clearDraft(field);
      toast.success(t("saved"));
    });
  }

  function requestCapacity(capacity: number) {
    setFieldError("capacity", null);
    if (!Number.isInteger(capacity) || capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
      setFieldError("capacity", t("controls.range", { min: CAPACITY_MIN, max: CAPACITY_MAX }));
      return;
    }
    if (capacity === current.capacity) {
      clearDraft("capacity");
      return;
    }
    // Shrinking below the downloads in flight stops nobody, but it does
    // refuse every new one until enough finish: worth a second look.
    if (capacity < current.active) {
      setConfirm({ kind: "capacity", capacity });
      return;
    }
    patch({ capacity }, "capacity");
  }

  function submitRetry() {
    setFieldError("retry", null);
    const value = Number(retryDraft ?? current.retry_after_seconds);
    if (!Number.isInteger(value) || value < RETRY_AFTER_MIN || value > RETRY_AFTER_MAX) {
      setFieldError("retry", t("controls.range", { min: RETRY_AFTER_MIN, max: RETRY_AFTER_MAX }));
      return;
    }
    if (value === current.retry_after_seconds) {
      clearDraft("retry");
      return;
    }
    patch({ retry_after_seconds: value }, "retry");
  }

  function submitTimeout() {
    setFieldError("timeout", null);
    // Minutes in the UI, seconds on the wire.
    const minutes = Number((timeoutDraft ?? secondsToMinutes(current.download_timeout_seconds)).replace(",", "."));
    const seconds = Math.round(minutes * 60);
    if (!Number.isFinite(minutes) || seconds < DOWNLOAD_TIMEOUT_MIN || seconds > DOWNLOAD_TIMEOUT_MAX) {
      setFieldError(
        "timeout",
        t("controls.timeoutRange", { max: DOWNLOAD_TIMEOUT_MAX / 60 }),
      );
      return;
    }
    if (seconds === current.download_timeout_seconds) {
      clearDraft("timeout");
      return;
    }
    patch({ download_timeout_seconds: seconds }, "timeout");
  }

  function reset() {
    startTransition(async () => {
      const r = await resetDownloadQueueAction();
      if (!r.ok) {
        toast.error(describeError({ status: r.status, message: r.error }));
        return;
      }
      setState(r.state);
      clearDraft("capacity");
      clearDraft("retry");
      clearDraft("timeout");
      toast.success(t("controls.resetDone"));
    });
  }

  function evict(slot: DownloadQueueSlot) {
    startTransition(async () => {
      const r = await evictDownloadQueueSlotAction(slot.id);
      // 404: the download finished in the meantime. Not an error worth
      // shouting about - just bring the list up to date.
      if (!r.ok && r.status !== 404) {
        toast.error(describeError({ status: r.status, message: r.error }));
      } else if (r.ok) {
        toast.success(t("slots.evicted"));
      }
      await refresh();
    });
  }

  function evictAll() {
    startTransition(async () => {
      const r = await evictAllDownloadQueueSlotsAction();
      if (!r.ok) {
        toast.error(describeError({ status: r.status, message: r.error }));
      } else {
        toast.success(t("slots.evictedAll", { count: r.evicted }));
      }
      await refresh();
    });
  }

  function onConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "capacity") patch({ capacity: c.capacity }, "capacity");
    else if (c.kind === "evict") evict(c.slot);
    else evictAll();
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const full = current.available === 0;
  const fill = current.capacity > 0 ? Math.min(100, (current.active / current.capacity) * 100) : 100;
  const finished = current.completed_total + current.failed_total;
  const successRate = finished > 0 ? (current.completed_total / finished) * 100 : null;
  const failReasons = Object.entries(current.failed_by_reason ?? {})
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  const serverTimeouts = current.failed_by_reason?.["server timeout"] ?? 0;
  const defaultsText = t("controls.defaults", {
    enabled: current.defaults.enabled ? t("status.enabled") : t("status.disabled"),
    capacity: current.defaults.capacity,
    retry: current.defaults.retry_after_seconds,
    timeout: duration(current.defaults.download_timeout_seconds),
  });

  return (
    <div className="space-y-6">
      <RestartNotice />

      {loadError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {t("errors.stale")} {describeError(loadError)}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Status */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{t("status.title")}</CardTitle>
              <Badge variant={current.enabled ? "default" : "secondary"}>
                {current.enabled ? t("status.enabled") : t("status.disabled")}
              </Badge>
              {modified && <Badge variant="outline">{t("status.modified")}</Badge>}
            </div>
            <CardDescription>
              {current.enabled ? t("status.enabledHint") : t("status.disabledHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {t("status.usage", { active: current.active, capacity: current.capacity })}
                </span>
                <span className={cn("text-muted-foreground", full && "text-destructive font-medium")}>
                  {t("status.available", { available: current.available })}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={current.capacity}
                aria-valuenow={current.active}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    full ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ width: `${fill}%` }}
                />
              </div>
              {current.active > current.capacity && (
                <p className="text-xs text-destructive">{t("status.overCapacity")}</p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <Stat label={t("status.bandwidth")} value={speed(current.total_bytes_per_sec)} />
              <Stat
                label={t("status.successRate")}
                value={successRate === null ? "—" : `${oneDecimal(successRate)}%`}
              />
              <Stat label={t("status.retryAfter")} value={t("seconds", { value: current.retry_after_seconds })} />
              <Stat label={t("status.downloadTimeout")} value={duration(current.download_timeout_seconds)} />
              <Stat label={t("status.completed")} value={current.completed_total} />
              <Stat
                label={t("status.failed")}
                value={current.failed_total}
                className={current.failed_total > 0 ? "text-destructive" : undefined}
              />
              <Stat label={t("status.rejected")} value={current.rejected_total} />
              <Stat label={t("status.evicted")} value={current.evicted_total} />
            </dl>

            {failReasons.length > 0 && (
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("status.failedBreakdown")}</p>
                <ul className="space-y-0.5 text-sm">
                  {failReasons.map(([reason, count]) => (
                    <li key={reason} className="flex justify-between gap-4">
                      <span>
                        {reason in FAIL_REASON_KEYS ? t(`failReason.${FAIL_REASON_KEYS[reason]}`) : reason}
                      </span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* A server timeout means a slow line that couldn't finish in
                time: the one counter that tells the admin what to change. */}
            {serverTimeouts > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("status.serverTimeoutHint", {
                  count: serverTimeouts,
                  timeout: duration(current.download_timeout_seconds),
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("status.sinceRestart")}</p>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t("controls.title")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || !modified}
                onClick={reset}
                title={defaultsText}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("controls.reset")}
              </Button>
            </div>
            <CardDescription>{defaultsText}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t("controls.enabled")}</p>
                <p className="text-xs text-muted-foreground">{t("controls.enabledHint")}</p>
              </div>
              <Button
                variant={current.enabled ? "outline" : "default"}
                size="sm"
                disabled={isPending}
                onClick={() => patch({ enabled: !current.enabled })}
              >
                <Power className="mr-2 h-4 w-4" />
                {current.enabled ? t("controls.disable") : t("controls.enable")}
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dq-capacity">{t("controls.capacity")}</Label>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  requestCapacity(Number(capacityDraft ?? current.capacity));
                }}
              >
                <Input
                  id="dq-capacity"
                  type="number"
                  inputMode="numeric"
                  min={CAPACITY_MIN}
                  max={CAPACITY_MAX}
                  className="w-28"
                  value={capacityDraft ?? String(current.capacity)}
                  aria-invalid={fieldErrors.capacity ? true : undefined}
                  onChange={(e) => {
                    setCapacityDraft(e.target.value);
                    setFieldError("capacity", null);
                  }}
                />
                <Button type="submit" size="sm" disabled={isPending || capacityDraft === null}>
                  {t("controls.apply")}
                </Button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || current.capacity - 10 < CAPACITY_MIN}
                    onClick={() => requestCapacity(current.capacity - 10)}
                  >
                    −10
                  </Button>
                  {CAPACITY_STEPS.map((step) => (
                    <Button
                      key={step}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending || current.capacity + step > CAPACITY_MAX}
                      onClick={() => requestCapacity(current.capacity + step)}
                    >
                      +{step}
                    </Button>
                  ))}
                </div>
              </form>
              <FieldError message={fieldErrors.capacity} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dq-retry">{t("controls.retryAfter")}</Label>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRetry();
                }}
              >
                <Input
                  id="dq-retry"
                  type="number"
                  inputMode="numeric"
                  min={RETRY_AFTER_MIN}
                  max={RETRY_AFTER_MAX}
                  className="w-28"
                  value={retryDraft ?? String(current.retry_after_seconds)}
                  aria-invalid={fieldErrors.retry ? true : undefined}
                  onChange={(e) => {
                    setRetryDraft(e.target.value);
                    setFieldError("retry", null);
                  }}
                />
                <span className="text-sm text-muted-foreground">{t("controls.secondsUnit")}</span>
                <Button type="submit" size="sm" disabled={isPending || retryDraft === null}>
                  {t("controls.apply")}
                </Button>
              </form>
              <FieldError message={fieldErrors.retry} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dq-timeout">{t("controls.downloadTimeout")}</Label>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTimeout();
                }}
              >
                <Input
                  id="dq-timeout"
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  max={DOWNLOAD_TIMEOUT_MAX / 60}
                  step="any"
                  className="w-28"
                  value={timeoutDraft ?? secondsToMinutes(current.download_timeout_seconds)}
                  aria-invalid={fieldErrors.timeout ? true : undefined}
                  onChange={(e) => {
                    setTimeoutDraft(e.target.value);
                    setFieldError("timeout", null);
                  }}
                />
                <span className="text-sm text-muted-foreground">{t("controls.minutesUnit")}</span>
                <Button type="submit" size="sm" disabled={isPending || timeoutDraft === null}>
                  {t("controls.apply")}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">{t("controls.downloadTimeoutHint")}</p>
              <FieldError message={fieldErrors.timeout} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* In-flight downloads */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("slots.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("slots.description")}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || current.slots.length === 0}
            onClick={() => setConfirm({ kind: "evictAll", count: current.slots.length })}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            {t("slots.evictAll")}
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("slots.product")}</TableHead>
                <TableHead>{t("slots.version")}</TableHead>
                <TableHead>{t("slots.hostname")}</TableHead>
                <TableHead>{t("slots.ip")}</TableHead>
                <TableHead>{t("slots.hwid")}</TableHead>
                <TableHead>{t("slots.started")}</TableHead>
                <TableHead className="min-w-44">{t("slots.progress")}</TableHead>
                <TableHead>{t("slots.speed")}</TableHead>
                <TableHead>{t("slots.expiresIn")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.slots.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    {t("slots.empty")}
                  </TableCell>
                </TableRow>
              )}
              {current.slots.map((slot) => {
                const deadline = Date.parse(slot.deadline_at);
                const remainingBytes =
                  slot.bytes_total !== undefined ? Math.max(0, slot.bytes_total - slot.bytes_sent) : null;
                const etaSeconds =
                  remainingBytes !== null && remainingBytes > 0 && slot.avg_bytes_per_sec > 0
                    ? remainingBytes / slot.avg_bytes_per_sec
                    : null;
                const slow =
                  slot.elapsed_seconds >= SLOW_GRACE_SECONDS && slot.avg_bytes_per_sec < SLOW_BYTES_PER_SEC;
                // Won't make it before the server cuts it: evicting frees the
                // slot now instead of at the deadline.
                const late = etaSeconds !== null && now + etaSeconds * 1000 > deadline;
                return (
                  <TableRow key={slot.id} className={cn(late && "bg-destructive/5", !late && slow && "bg-amber-500/5")}>
                    <TableCell>
                      <Badge variant="secondary">{t(`product.${slot.product}`)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{slot.version}</TableCell>
                    <TableCell className="text-sm">{slot.hostname ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{slot.ip ?? "—"}</TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs" title={slot.hwid}>
                      {slot.hwid ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={formatDateTime(slot.started_at)}>
                      {t("slots.startedAgo", {
                        elapsed: duration((now - Date.parse(slot.started_at)) / 1000),
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ProgressBar percent={slot.percent} />
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {slot.bytes_total !== undefined
                            ? t("slots.bytesOf", {
                                sent: mb(slot.bytes_sent),
                                total: mb(slot.bytes_total),
                                percent: oneDecimal(slot.percent ?? 0),
                              })
                            : t("slots.bytesSent", { sent: mb(slot.bytes_sent) })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className={cn("flex items-center gap-1 tabular-nums", slow && "text-amber-700 dark:text-amber-400")}>
                        {slow && <Turtle className="h-3.5 w-3.5" aria-label={t("slots.slow")} />}
                        <span title={t("slots.speedHint")}>{speed(slot.avg_bytes_per_sec)}</span>
                      </div>
                      {etaSeconds !== null && (
                        <p className={cn("text-xs text-muted-foreground", late && "text-destructive")}>
                          {t("slots.eta", { eta: duration(etaSeconds) })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn("text-sm text-muted-foreground tabular-nums", late && "text-destructive font-medium")}
                      title={formatDateTime(slot.deadline_at)}
                    >
                      {deadline > now ? duration((deadline - now) / 1000) : t("slots.expired")}
                      {late && <p className="text-xs font-normal">{t("slots.late")}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={late ? "destructive" : "ghost"}
                        size="sm"
                        disabled={isPending}
                        onClick={() => setConfirm({ kind: "evict", slot })}
                      >
                        {t("slots.evict")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "capacity" && t("confirm.capacityTitle", { capacity: confirm.capacity })}
              {confirm?.kind === "evict" && t("confirm.evictTitle")}
              {confirm?.kind === "evictAll" && t("confirm.evictAllTitle", { count: confirm.count })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "capacity" &&
                t("confirm.capacityDescription", { capacity: confirm.capacity, active: current.active })}
              {confirm?.kind === "evict" &&
                t("confirm.evictDescription", {
                  product: t(`product.${confirm.slot.product}`),
                  version: confirm.slot.version,
                  host: confirm.slot.hostname ?? confirm.slot.ip ?? `#${confirm.slot.id}`,
                })}
              {confirm?.kind === "evictAll" && t("confirm.evictAllDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.kind === "capacity"
                  ? undefined
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
              onClick={onConfirm}
            >
              {confirm?.kind === "capacity" ? t("confirm.capacityConfirm") : t("confirm.evictConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RestartNotice() {
  const t = useTranslations("downloadQueue");
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{t("restartNotice")}</AlertDescription>
    </Alert>
  );
}

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/** Determinate when the size is known, an indeterminate pulse before that. */
function ProgressBar({ percent }: { percent?: number }) {
  const known = percent !== undefined;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? percent : undefined}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-all", !known && "w-1/3 animate-pulse opacity-60")}
        style={known ? { width: `${Math.min(100, Math.max(0, percent))}%` } : undefined}
      />
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<"downloadQueue">>;

/** "12 s", "3 min 4 s", "1 h 20 min". */
function formatDuration(seconds: number, t: Translate) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t("elapsed.hours", { h, m });
  if (m > 0) return s > 0 ? t("elapsed.minutes", { m, s }) : t("elapsed.minutesOnly", { m });
  return t("elapsed.seconds", { s });
}
