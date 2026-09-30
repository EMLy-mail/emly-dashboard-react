"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Power, RotateCcw, Square, XCircle } from "lucide-react";
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

type LoadError = { status?: number; message: string };

type Confirm =
  | { kind: "capacity"; capacity: number }
  | { kind: "evict"; slot: DownloadQueueSlot }
  | { kind: "evictAll"; count: number };

function isModified(state: DownloadQueueState) {
  const d = state.defaults;
  return (
    state.enabled !== d.enabled ||
    state.capacity !== d.capacity ||
    state.retry_after_seconds !== d.retry_after_seconds
  );
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
  const [state, setState] = useState(initialState);
  const [loadError, setLoadError] = useState(initialError);
  const [now, setNow] = useState(renderedAt);
  // null = show the live value; a string = the admin is typing.
  const [capacityDraft, setCapacityDraft] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<string | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
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

  // ── Mutations ────────────────────────────────────────────────────────────
  function patch(data: Partial<DownloadQueueSettings>, field?: "capacity" | "retry") {
    startTransition(async () => {
      const r = await updateDownloadQueueAction(data);
      if (!r.ok) {
        const message = r.status === 400 ? r.error : describeError({ status: r.status, message: r.error });
        if (r.status === 400 && field === "capacity") setCapacityError(message);
        else if (r.status === 400 && field === "retry") setRetryError(message);
        else toast.error(message);
        return;
      }
      setState(r.state);
      setLoadError(null);
      if (field === "capacity") {
        setCapacityDraft(null);
        setCapacityError(null);
      }
      if (field === "retry") {
        setRetryDraft(null);
        setRetryError(null);
      }
      toast.success(t("saved"));
    });
  }

  function requestCapacity(capacity: number) {
    setCapacityError(null);
    if (!Number.isInteger(capacity) || capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
      setCapacityError(t("controls.capacityRange", { min: CAPACITY_MIN, max: CAPACITY_MAX }));
      return;
    }
    if (capacity === current.capacity) {
      setCapacityDraft(null);
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
    setRetryError(null);
    const value = Number(retryDraft ?? current.retry_after_seconds);
    if (!Number.isInteger(value) || value < RETRY_AFTER_MIN || value > RETRY_AFTER_MAX) {
      setRetryError(t("controls.retryRange", { min: RETRY_AFTER_MIN, max: RETRY_AFTER_MAX }));
      return;
    }
    if (value === current.retry_after_seconds) {
      setRetryDraft(null);
      return;
    }
    patch({ retry_after_seconds: value }, "retry");
  }

  function reset() {
    startTransition(async () => {
      const r = await resetDownloadQueueAction();
      if (!r.ok) {
        toast.error(describeError({ status: r.status, message: r.error }));
        return;
      }
      setState(r.state);
      setCapacityDraft(null);
      setRetryDraft(null);
      setCapacityError(null);
      setRetryError(null);
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

  // ── Render ───────────────────────────────────────────────────────────────
  const full = current.available === 0;
  const fill = current.capacity > 0 ? Math.min(100, (current.active / current.capacity) * 100) : 100;

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

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Stat label={t("status.retryAfter")} value={t("seconds", { value: current.retry_after_seconds })} />
              <Stat label={t("status.acquired")} value={current.acquired_total} />
              <Stat label={t("status.rejected")} value={current.rejected_total} />
              <Stat label={t("status.evicted")} value={current.evicted_total} />
            </dl>
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
                title={t("controls.resetHint", {
                  enabled: current.defaults.enabled ? t("status.enabled") : t("status.disabled"),
                  capacity: current.defaults.capacity,
                  retry: current.defaults.retry_after_seconds,
                })}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("controls.reset")}
              </Button>
            </div>
            <CardDescription>
              {t("controls.defaults", {
                enabled: current.defaults.enabled ? t("status.enabled") : t("status.disabled"),
                capacity: current.defaults.capacity,
                retry: current.defaults.retry_after_seconds,
              })}
            </CardDescription>
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
                  aria-invalid={capacityError ? true : undefined}
                  onChange={(e) => {
                    setCapacityDraft(e.target.value);
                    setCapacityError(null);
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
              {capacityError && <p className="text-xs text-destructive">{capacityError}</p>}
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
                  aria-invalid={retryError ? true : undefined}
                  onChange={(e) => {
                    setRetryDraft(e.target.value);
                    setRetryError(null);
                  }}
                />
                <span className="text-sm text-muted-foreground">{t("controls.secondsUnit")}</span>
                <Button type="submit" size="sm" disabled={isPending || retryDraft === null}>
                  {t("controls.apply")}
                </Button>
              </form>
              {retryError && <p className="text-xs text-destructive">{retryError}</p>}
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
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.slots.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t("slots.empty")}
                  </TableCell>
                </TableRow>
              )}
              {current.slots.map((slot) => (
                <TableRow key={slot.id}>
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
                    {t("slots.startedAgo", { elapsed: formatElapsed(now - Date.parse(slot.started_at), t) })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirm({ kind: "evict", slot })}
                    >
                      {t("slots.evict")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<"downloadQueue">>;

/** "12 s", "3 min 4 s", "1 h 20 min". */
function formatElapsed(ms: number, t: Translate) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t("elapsed.hours", { h, m });
  if (m > 0) return t("elapsed.minutes", { m, s });
  return t("elapsed.seconds", { s });
}
