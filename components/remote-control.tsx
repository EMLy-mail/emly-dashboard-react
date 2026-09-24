"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Activity,
  Download,
  Info,
  Loader2,
  Package,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type {
  ClientCommandName,
  ClientCommandRecord,
  ClientCommandStatus,
  ClientEventRecord,
  UpdaterClient,
} from "@/lib/api";
import {
  issueCommandAction,
  listEventsAction,
  pollCommandAction,
} from "@/lib/actions/client-commands";
import { useLiveStatsClients } from "@/hooks/use-stats-stream";
import { MIN_COMMAND_UPDATER_VERSION, supportsRemoteCommands } from "@/lib/device-status";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POLL_MS = 2000;
const EVENTS_POLL_MS = 10000;
const MAX_HISTORY = 30;

// next-intl reads dots in a key as nesting, so the wire names ("machine.info")
// cannot be message keys themselves.
const COMMAND_KEY: Record<ClientCommandName, string> = {
  "machine.info": "machineInfo",
  "emly.manifest.check": "emlyManifest",
  "updater.manifest.check": "updaterManifest",
  "apps.list_upgradable": "appsUpgradable",
  "service.restart": "serviceRestart",
  "machine.reboot": "machineReboot",
};

const SAFE_COMMANDS: { name: ClientCommandName; icon: typeof Info }[] = [
  { name: "machine.info", icon: Info },
  { name: "emly.manifest.check", icon: ShieldCheck },
  { name: "updater.manifest.check", icon: Download },
  { name: "apps.list_upgradable", icon: Package },
];

// Defined here, not in lib/api.ts: that module is server-only, so a client
// component may import types from it but never a value.
function isClientCommandFinal(status: ClientCommandStatus): boolean {
  return status === "done" || status === "failed" || status === "rejected" || status === "timeout";
}

function statusVariant(s: ClientCommandStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "done":
      return "default";
    case "failed":
    case "rejected":
    case "timeout":
      return "destructive";
    case "acked":
      return "secondary";
    default:
      return "outline";
  }
}

function errorLine(c: ClientCommandRecord): string | null {
  const e = c.error ?? c.result?.error;
  if (!e) return null;
  return e.message ? `${e.code}: ${e.message}` : e.code;
}

export function RemoteControl() {
  const t = useTranslations("remote");
  const { clients } = useLiveStatsClients();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<ClientCommandRecord[]>([]);
  const [events, setEvents] = useState<{ clientId: number; list: ClientEventRecord[] } | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"service.restart" | "machine.reboot" | null>(null);
  const [delay, setDelay] = useState("60");
  const [whenActive, setWhenActive] = useState<"warn" | "skip">("warn");
  const [sending, startSending] = useTransition();

  // A machine can take a command only if it holds the presence WebSocket open
  // right now (an "estimated" presence - recent poll, no socket - cannot) and
  // runs an updater that understands the command frames.
  const commandable = useMemo(
    () => clients.filter((c) => c.online && supportsRemoteCommands(c.updater_version)),
    [clients],
  );
  const tooOldCount = useMemo(
    () => clients.filter((c) => c.online && !supportsRemoteCommands(c.updater_version)).length,
    [clients],
  );
  const offlineCount = clients.filter((c) => !c.online).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? commandable.filter((c) =>
          [c.hostname, c.logged_user, c.last_ip, c.serial]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : commandable;
    return [...list].sort((a, b) => a.hostname.localeCompare(b.hostname));
  }, [commandable, search]);

  // Look the selection up in the full list, not the commandable one: a machine
  // whose socket just dropped stays on screen (buttons disabled) instead of
  // the panel vanishing under the operator's cursor.
  const selected: UpdaterClient | null = useMemo(
    () => clients.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );
  const selectedLive = selected?.online === true && supportsRemoteCommands(selected.updater_version);

  // ── Poll unfinished commands ─────────────────────────────────────────────
  const pendingKey = history
    .filter((c) => !isClientCommandFinal(c.status))
    .map((c) => c.id)
    .join(",");

  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(",");
    let cancelled = false;
    const tick = async () => {
      const results = await Promise.all(ids.map((id) => pollCommandAction(id)));
      if (cancelled) return;
      setHistory((prev) =>
        prev.map((c) => {
          const i = ids.indexOf(c.id);
          const r = i >= 0 ? results[i] : undefined;
          if (r?.ok) return r.command;
          // The API forgot the command (restart of the API, or aged out of
          // its in-memory table): stop polling it rather than spin forever.
          if (r && !r.ok && r.status === 404) return { ...c, status: "timeout" as const };
          return c;
        }),
      );
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingKey]);

  // ── Events of the selected machine ───────────────────────────────────────
  const loadEvents = useCallback(async (clientId: number) => {
    const r = await listEventsAction(clientId);
    if (r.ok) {
      setEvents({ clientId, list: r.events });
      setEventsError(null);
    } else {
      setEventsError(r.error);
    }
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    const run = async () => {
      const r = await listEventsAction(selectedId);
      if (cancelled) return;
      if (r.ok) {
        setEvents({ clientId: selectedId, list: r.events });
        setEventsError(null);
      } else {
        setEventsError(r.error);
      }
    };
    void run();
    const timer = setInterval(() => void run(), EVENTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedId]);

  // ── Sending ──────────────────────────────────────────────────────────────
  function send(name: ClientCommandName, args?: { delaySeconds?: number; whenUserActive?: "warn" | "skip" }) {
    if (!selected) return;
    const clientId = selected.id;
    startSending(async () => {
      const r = await issueCommandAction(clientId, name, args);
      if (!r.ok) {
        toast.error(r.status === 409 ? t("errors.offline") : r.error);
        return;
      }
      toast.success(t("sent"));
      setHistory((prev) => [r.command, ...prev].slice(0, MAX_HISTORY));
    });
  }

  function confirmDestructive() {
    const name = confirm;
    setConfirm(null);
    if (!name) return;
    if (name === "machine.reboot") {
      const d = Number(delay);
      if (!Number.isInteger(d) || d < 0 || d > 3600) {
        toast.error(t("reboot.invalidDelay"));
        return;
      }
      send(name, { delaySeconds: d, whenUserActive: whenActive });
    } else {
      send(name);
    }
  }

  const selectedHistory = history.filter((c) => c.client_id === selectedId);
  const selectedEvents = events && events.clientId === selectedId ? events.list : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      {/* Machine picker */}
      <Card className="lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between text-base">
            {t("machines.title")}
            <Badge variant="secondary">{commandable.length}</Badge>
          </CardTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("machines.search")}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-1 lg:overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("machines.empty")}</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "flex w-full flex-col rounded-md px-3 py-2 text-left text-sm transition-colors",
                c.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span className="truncate">{c.hostname}</span>
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  c.id === selectedId ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {c.logged_user || c.last_ip || "-"}
              </span>
            </button>
          ))}
          <div className="space-y-1 pt-2 text-xs text-muted-foreground">
            {tooOldCount > 0 && (
              <p>{t("machines.tooOld", { count: tooOldCount, version: MIN_COMMAND_UPDATER_VERSION })}</p>
            )}
            {offlineCount > 0 && <p>{t("machines.hidden", { count: offlineCount })}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Control panel */}
      <div className="space-y-4">
        {!selected ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{t("selectPrompt", { version: MIN_COMMAND_UPDATER_VERSION })}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {selected.hostname}
                  <Badge variant={selectedLive ? "default" : "destructive"}>
                    {selectedLive ? t("connected") : t("disconnected")}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {[
                    selected.logged_user,
                    selected.last_ip,
                    selected.updater_version && `updater ${selected.updater_version}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium">{t("groups.read")}</h3>
                  <div className="flex flex-wrap gap-2">
                    {SAFE_COMMANDS.map(({ name, icon: Icon }) => (
                      <Button
                        key={name}
                        variant="outline"
                        size="sm"
                        disabled={!selectedLive || sending}
                        onClick={() => send(name)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {t(`commands.${COMMAND_KEY[name]}`)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">{t("groups.destructive")}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedLive || sending}
                      onClick={() => setConfirm("service.restart")}
                    >
                      <RotateCw className="mr-2 h-4 w-4" />
                      {t("commands.serviceRestart")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!selectedLive || sending}
                      onClick={() => setConfirm("machine.reboot")}
                    >
                      <Power className="mr-2 h-4 w-4" />
                      {t("commands.machineReboot")}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("groups.destructiveHint")}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("history.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
                )}
                {selectedHistory.map((c) => (
                  <CommandRow key={c.id} record={c} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  {t("events.title")}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("events.refresh")}
                  onClick={() => selectedId !== null && void loadEvents(selectedId)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("events.hint")}</p>
                {eventsError && (
                  <Alert variant="destructive">
                    <AlertDescription>{eventsError}</AlertDescription>
                  </Alert>
                )}
                {selectedEvents?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("events.empty")}</p>
                )}
                {selectedEvents
                  ?.slice()
                  .reverse()
                  .map((e, i) => (
                    <details key={e.id ?? i} className="rounded-md border px-3 py-2 text-sm">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                        <span className="font-mono">{e.name}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(e.received_at)}</span>
                        {e.truncated && <Badge variant="outline">{t("events.truncated")}</Badge>}
                      </summary>
                      {e.payload !== undefined && (
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      )}
                    </details>
                  ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "machine.reboot" ? t("reboot.title") : t("restart.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(confirm === "machine.reboot" ? "reboot.description" : "restart.description", {
                host: selected?.hostname ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "machine.reboot" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reboot-delay">{t("reboot.delay")}</Label>
                <Input
                  id="reboot-delay"
                  type="number"
                  min={0}
                  max={3600}
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("reboot.whenActive")}</Label>
                <Select value={whenActive} onValueChange={(v) => setWhenActive(v as "warn" | "skip")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">{t("reboot.warn")}</SelectItem>
                    <SelectItem value="skip">{t("reboot.skip")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDestructive}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CommandRow({ record }: { record: ClientCommandRecord }) {
  const t = useTranslations("remote");
  const err = errorLine(record);
  const final = isClientCommandFinal(record.status);
  const payload = record.result?.payload;
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t(`commands.${COMMAND_KEY[record.name]}`)}</span>
        <Badge variant={statusVariant(record.status)}>
          {!final && <Loader2 className="animate-spin" />}
          {t(`status.${record.status}`)}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(record.issued_at)}</span>
        {record.result?.duration_ms !== undefined && (
          <span className="text-xs text-muted-foreground">{record.result.duration_ms} ms</span>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      {payload !== undefined && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t("history.result")}
            {record.result?.truncated ? ` (${t("events.truncated")})` : ""}
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
