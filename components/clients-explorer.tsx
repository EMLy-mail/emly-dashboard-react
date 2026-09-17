"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDown,
  Check,
  CircleAlert,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Ban as BanIcon,
  CheckCircle2,
  Eye,
  EyeOff,
  Monitor,
  MonitorX,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  ShieldAlert,
  TriangleAlert,
  UserX,
  X,
  Network,
  Globe,
  GlobeOff,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight
} from "lucide-react";
import type { Ban, UpdaterClient } from "@/lib/api";
import {
  assessDevice,
  compareIps,
  compareVersions,
  isSessionDisconnected,
  maskIp,
  maskSerial,
  maskUser,
  type DcLookupMap,
  type DeviceAssessment,
  type DeviceRank,
} from "@/lib/device-status";
import { useLiveStatsClients } from "@/hooks/use-stats-stream";
import { LoggedUserName } from "@/components/logged-user-name";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
const RANKS: DeviceRank[] = ["critical", "warning", "ok"];
// Radix reserves "" as an item value, so the "no filter" options need sentinels.
const ANY = "__any__";
// Only ever shown, never chosen: it is how the select renders a chip
// combination that is neither "all" nor a single rank.
const CUSTOM = "__custom__";
type ConnectionFilter = "__any__" | "online" | "offline";
// The online/offline split is time-based, so a list left open would slowly
// drift out of date even while the stream keeps the rows themselves fresh.
const CLOCK_REFRESH_MS = 30_000;
// First updater build that reports the signed-in account. Anything older
// simply never sends the field, so its blank logged-user cell says nothing
// about the machine and has to be read as "unknown", not "nobody".
const LOGGED_USER_MIN_UPDATER_VERSION = "1.6.1";
// Panel width bounds, in px. The floor is what the widest label in the
// detail list needs before it starts wrapping mid-word.
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 720;
const DEFAULT_PANEL_WIDTH = 400;

type SortColumn =
  | "rank"
  | "hostname"
  | "lastSeen"
  | "connected"
  | "loggedUser"
  | "lastIp"
  | "updaterVersion"
  | "createdAt";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
// Past this, "2 mesi fa" stops being useful and an actual date is what you
// want, so the columns switch over to a plain calendar date.
const ABSOLUTE_AFTER_MS = 30 * DAY_MS;

/**
 * "un minuto fa" / "due settimane fa" for anything inside the last month, a
 * calendar date beyond it. Localised through Intl rather than a hand-written
 * word list, so it follows whichever locale the cookie selected.
 */
function formatWhen(iso: string, now: number, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "\u2014";

  // Clock skew can put a sighting slightly in the future; clamp so it never
  // renders as "tra 3 secondi".
  const elapsed = Math.max(1000, now - then);
  if (elapsed >= ABSOLUTE_AFTER_MS) {
    return new Date(then).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  // floor, not round, so 90 seconds reads "1 minuto fa" and never "2 minuti fa"
  // while the clock still says one.
  if (elapsed < MINUTE_MS) return rtf.format(-Math.floor(elapsed / 1000), "second");
  if (elapsed < HOUR_MS) return rtf.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return rtf.format(-Math.floor(elapsed / HOUR_MS), "hour");
  if (elapsed < WEEK_MS) return rtf.format(-Math.floor(elapsed / DAY_MS), "day");
  return rtf.format(-Math.floor(elapsed / WEEK_MS), "week");
}
/**
 * An icon that carries its own explanation. `hint` is both the tooltip and
 * the accessible name, so a screen reader hears the same sentence a pointer
 * user reads instead of a bare "image". The wrapping span is what takes
 * focus: an inline SVG is not tabbable, so without it the tooltip would be
 * pointer-only. It is block-level (`flex`, not `inline-flex`) on purpose —
 * an inline box gets a line box with room for descenders under it, which
 * lifted the glyph a couple of pixels above the text in its neighbouring
 * cells. As a block it is just the icon, which the cell's own `align-middle`
 * then centres exactly.
 */
function HintedIcon({
  icon: Icon,
  hint,
  className,
}: {
  icon: typeof CheckCircle2;
  hint: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="flex w-fit rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
        >
          <Icon className={cn("h-4 w-4", className)} role="img" aria-label={hint} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * True only for a build we can read *and* that sits below the floor. A
 * version the API never reported, or one that will not parse, is unknown
 * rather than too old, so it falls through to the plain "no user" icon.
 */
function updaterTooOldForLoggedUser(version: string | null | undefined): boolean {
  if (!version) return false;
  return compareVersions(version, LOGGED_USER_MIN_UPDATER_VERSION) === -1;
}

/** Tooltip for a disconnected session, dated when the API knows since when. */
function disconnectedSessionHint(
  client: UpdaterClient,
  t: ReturnType<typeof useTranslations<"clients">>,
  locale: string,
): string {
  return client.logged_user_disconnected_at
    ? t("iconHint.sessionDisconnectedSince", {
        date: new Date(client.logged_user_disconnected_at).toLocaleString(locale),
      })
    : t("iconHint.sessionDisconnected");
}

type SortState = { column: SortColumn; direction: "asc" | "desc" };

/** Empty values sort last whichever way the column is pointing. */
function compareStrings(a: string, b: string) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Per-rank presentation. Colours are written out rather than mapped onto the
 * theme's semantic tokens because only one of the three (critical) has one —
 * traffic-light green and amber are specific to this view.
 */
const RANK_STYLES: Record<DeviceRank, { dot: string; text: string; bar: string; icon: typeof CheckCircle2 }> = {
  ok: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "border-l-emerald-500",
    icon: CheckCircle2,
  },
  warning: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bar: "border-l-amber-500",
    icon: TriangleAlert,
  },
  critical: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bar: "border-l-red-500",
    icon: ShieldAlert,
  },
};

interface ClientsExplorerProps {
  /**
   * The server's clock at render time. Every rank depends on "is this machine
   * still inside the online window", so calling Date.now() here instead would
   * let SSR and hydration land on different sides of that threshold and
   * disagree about the counts. The interval below takes over after mount.
   */
  renderedAt: number;
  bans: Ban[];
  latestUpdaterVersion: string | null;
  latestAppVersion: string | null;
  dcLookupMap: DcLookupMap | null;
  windowMinutes: number;
}

interface ScoredClient {
  client: UpdaterClient;
  assessment: DeviceAssessment;
}

export function ClientsExplorer({
  renderedAt,
  bans,
  latestUpdaterVersion,
  latestAppVersion,
  dcLookupMap,
  windowMinutes,
}: ClientsExplorerProps) {
  const t = useTranslations("clients");
  const locale = useLocale();
  const { clients } = useLiveStatsClients();

  const [now, setNow] = useState(renderedAt);
  const [query, setQuery] = useState("");
  const [activeRanks, setActiveRanks] = useState<DeviceRank[]>([...RANKS]);
  const [connection, setConnection] = useState<ConnectionFilter>(ANY);
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [revealed, setRevealed] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const scored = useMemo<ScoredClient[]>(
    () =>
      clients.map((client) => ({
        client,
        assessment: assessDevice({
          client,
          bans,
          latestUpdaterVersion,
          latestAppVersion,
          // Reported per client since updater 1.6.3 (X-EMLy-AppVersion). A
          // machine that does not send it - an older updater, or one where
          // EMLy is not installed - still passes null here, which keeps the
          // app-version rules inert for that row instead of scoring it
          // against a version nobody reported.
          appVersion: client.emly_version ?? null,
          dcLookupMap,
          windowMinutes,
          now,
        }),
      })),
    [clients, bans, latestUpdaterVersion, latestAppVersion, dcLookupMap, windowMinutes, now],
  );

  // Counted over every client, not over the filtered set: these chips are how
  // you *choose* a filter, so they have to keep reporting the whole fleet.
  const counts = useMemo(() => {
    const tally: Record<DeviceRank, number> = { ok: 0, warning: 0, critical: 0 };
    for (const { assessment } of scored) tally[assessment.rank] += 1;
    return tally;
  }, [scored]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scored
      .filter(({ assessment }) => activeRanks.includes(assessment.rank))
      .filter(({ assessment }) => {
        if (connection === ANY) return true;
        return connection === "online" ? assessment.online : !assessment.online;
      })
      .filter(({ client }) => {
        if (!needle) return true;
        return [
          client.hostname,
          client.ad_domain,
          client.logged_user,
          client.last_ip,
          client.serial,
          client.product,
          client.updater_version,
          client.emly_version,
          client.os_version,
        ].some((field) => (field ?? "").toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        // No explicit sort means worst first: the point of the page is to
        // surface what needs work, so that is the useful default.
        if (!sort) {
          const byRank = RANKS.indexOf(a.assessment.rank) - RANKS.indexOf(b.assessment.rank);
          if (byRank !== 0) return byRank;
          return a.client.hostname.localeCompare(b.client.hostname, undefined, { numeric: true });
        }

        const dir = sort.direction === "asc" ? 1 : -1;
        switch (sort.column) {
          case "rank":
            // Ascending walks critical -> warning -> ok, matching how the
            // status chips read left to right.
            return dir * (RANKS.indexOf(a.assessment.rank) - RANKS.indexOf(b.assessment.rank));
          case "hostname":
            return dir * compareStrings(a.client.hostname, b.client.hostname);
          case "loggedUser":
            return dir * compareStrings(a.client.logged_user ?? "", b.client.logged_user ?? "");
          case "lastIp":
            return dir * compareIps(a.client.last_ip, b.client.last_ip);
          case "updaterVersion": {
            const av = a.client.updater_version ?? "";
            const bv = b.client.updater_version ?? "";
            // Unreported versions stay at the bottom either way round: it is
            // missing telemetry, not a build that sorts below 1.0.
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;
            // 1.6.1 must outrank 1.10.0 the way semver says, not the way text
            // comparison would; fall back to text only if either is unparseable.
            return dir * (compareVersions(av, bv) ?? compareStrings(av, bv));
          }
          case "connected":
            return dir * (Number(a.assessment.online) - Number(b.assessment.online));
          case "lastSeen":
            return (
              dir *
              (new Date(a.client.last_seen_at).getTime() - new Date(b.client.last_seen_at).getTime())
            );
          // Sorts on the underlying instant, not the rendered label, so
          // "2 settimane fa" and a calendar date still order against each other.
          case "createdAt":
            return (
              dir *
              (new Date(a.client.first_seen_at).getTime() -
                new Date(b.client.first_seen_at).getTime())
            );
          default:
            return 0;
        }
      });
  }, [scored, activeRanks, connection, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selected = useMemo(
    () => scored.find((entry) => entry.client.id === selectedId) ?? null,
    [scored, selectedId],
  );

  // Collapsed is only a thing while something is selected; with no selection
  // there is no panel to collapse, so the flag is simply not consulted.
  const panelOpen = selected !== null && !collapsed;

  // Selecting always reopens: picking a row while the panel sits collapsed
  // should show you the row you just picked, not silently change what a
  // hidden panel holds.
  function selectDevice(id: number) {
    setSelectedId(id);
    setCollapsed(false);
  }

  function clampWidth(px: number) {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, px));
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = panelWidth;
    handle.setPointerCapture(event.pointerId);

    // Dragging left widens the panel, since it is anchored to the right edge.
    const onMove = (move: PointerEvent) => setPanelWidth(clampWidth(startWidth - (move.clientX - startX)));
    const onUp = (up: PointerEvent) => {
      handle.releasePointerCapture(up.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  /** Keyboard equivalent of the drag, so the separator is not mouse-only. */
  function resizeByKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPanelWidth((w) => clampWidth(w + step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPanelWidth((w) => clampWidth(w - step));
    }
  }

  /** asc -> desc -> back to the default ordering, like the stats table. */
  function toggleSort(column: SortColumn) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      return prev.direction === "asc" ? { column, direction: "desc" } : null;
    });
    setPage(1);
  }

  function toggleRank(rank: DeviceRank) {
    setActiveRanks((prev) =>
      prev.includes(rank) ? prev.filter((r) => r !== rank) : [...prev, rank],
    );
    setPage(1);
  }

  // The chips and the select are two controls over one piece of state, so the
  // select reads back whatever the chips left behind rather than tracking its
  // own copy - that is what keeps the two from ever disagreeing on screen.
  const rankSelectValue =
    activeRanks.length === RANKS.length ? ANY : activeRanks.length === 1 ? activeRanks[0] : CUSTOM;

  function selectRank(value: string) {
    if (value === CUSTOM) return;
    setActiveRanks(value === ANY ? [...RANKS] : [value as DeviceRank]);
    setPage(1);
  }

  const isFiltered = query !== "" || connection !== ANY || activeRanks.length !== RANKS.length;

  function resetFilters() {
    setQuery("");
    setConnection(ANY);
    setActiveRanks([...RANKS]);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Status selector - the "Seleziona stati" row: each chip both reports a
          count and toggles that rank out of the list. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">{t("selectStates")}</span>
        {RANKS.map((rank) => {
          const active = activeRanks.includes(rank);
          const style = RANK_STYLES[rank];
          return (
            <button
              key={rank}
              type="button"
              aria-pressed={active}
              onClick={() => toggleRank(rank)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent",
                !active && "opacity-45",
              )}
            >
              {/* Always rendered so toggling a chip never shifts the row;
                  checked state reads off the icon's colour and the dimming
                  applied to the whole chip, plus aria-pressed for AT. */}
              <CheckCircle2
                className={cn("h-5 w-5 shrink-0", active ? style.text : "text-muted-foreground")}
                strokeWidth={2.5}
              />
              <span className={cn("font-medium", style.text)}>
                {t(`rank.${rank}`)}: {counts[rank]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={query}
            className="pl-8"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={rankSelectValue} onValueChange={selectRank}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allStates")}</SelectItem>
            {RANKS.map((rank) => (
              <SelectItem key={rank} value={rank}>
                {t(`rank.${rank}`)}
              </SelectItem>
            ))}
            {rankSelectValue === CUSTOM && (
              <SelectItem value={CUSTOM} disabled>
                {t("filters.customStates")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select
          value={connection}
          onValueChange={(v) => {
            setConnection(v as ConnectionFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allConnections")}</SelectItem>
            <SelectItem value="online">{t("online")}</SelectItem>
            <SelectItem value="offline">{t("offline")}</SelectItem>
          </SelectContent>
        </Select>

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-4 w-4" />
            {t("filters.reset")}
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          {t("count", { shown: filtered.length, total: scored.length })}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setRevealed((prev) => !prev)}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {revealed ? t("hideSensitive") : t("showSensitive")}
        </Button>
      </div>

      {/* Flex rather than grid: the panel's width is dragged to an arbitrary
          pixel value, and the table just takes whatever is left. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead column="rank" sort={sort} onSort={toggleSort} className="w-10">
                    <span className="sr-only">{t("table.status")}</span>
                  </SortableHead>
                  <SortableHead column="hostname" sort={sort} onSort={toggleSort}>
                    {t("table.hostname")}
                  </SortableHead>
                  <SortableHead column="lastSeen" sort={sort} onSort={toggleSort}>
                    {t("table.lastSeen")}
                  </SortableHead>
                  <SortableHead column="connected" sort={sort} onSort={toggleSort}>
                    {t("table.connected")}
                  </SortableHead>
                  <SortableHead
                    column="loggedUser"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden md:table-cell"
                  >
                    {t("table.loggedUser")}
                  </SortableHead>
                  <SortableHead
                    column="lastIp"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden lg:table-cell"
                  >
                    {t("table.lastIp")}
                  </SortableHead>
                  <SortableHead
                    column="updaterVersion"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden lg:table-cell"
                  >
                    {t("table.updaterVersion")}
                  </SortableHead>
                  <SortableHead
                    column="createdAt"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden xl:table-cell"
                  >
                    {t("table.createdAt")}
                  </SortableHead>
                </TableRow>

              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      {t("table.noData")}
                    </TableCell>
                  </TableRow>
                )}
                {visible.map(({ client, assessment }) => {
                  const style = RANK_STYLES[assessment.rank];
                  const isSelected = client.id === selectedId;
                  // Shape carries reachability, colour carries the rank, so one
                  // glyph answers "can I reach it" and "is it healthy" at once.
                  const ConnectionIcon = assessment.online ? Monitor : MonitorX;
                  return (
                    // The row stays a row: giving a <tr> button semantics would
                    // strip the table structure screen readers navigate by. The
                    // click handler is a mouse convenience layered on top of the
                    // real control in the hostname cell.
                    <TableRow
                      key={client.id}
                      onClick={() => selectDevice(client.id)}
                      className={cn("cursor-pointer", isSelected && "bg-accent")}
                    >
                      {/* The status bar lives on the first cell, not the row:
                          TableBody resets the last row with border-0, which
                          would wipe a row-level border-l and leave the bottom
                          row of every page unmarked. */}
                      {/* The rank bar rides the first cell, not the row:
                          TableBody resets the last row with border-0, which
                          would wipe a row-level border-l and leave the bottom
                          row of every page unmarked. */}
                      <TableCell className={cn("border-l-2", style.bar)}>
                        <ConnectionIcon
                          className={cn("h-4 w-4", style.text)}
                          role="img"
                          aria-label={`${t(`rank.${assessment.rank}`)} · ${
                            assessment.online ? t("online") : t("offline")
                          }`}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectDevice(client.id)}
                          className="font-medium hover:underline"
                        >
                          {client.hostname}
                        </button>
                      </TableCell>
                      {/* title carries the exact timestamp the relative label
                          rounds away. */}
                      <TableCell
                        className="text-sm text-muted-foreground"
                        title={new Date(client.last_seen_at).toLocaleString(locale)}
                        suppressHydrationWarning
                      >
                        {formatWhen(client.last_seen_at, now, locale)}
                      </TableCell>
                      {/* Three states, not two: a machine answering from
                          outside the LAN is reachable but not on the network
                          you can reach back on, so it gets its own amber globe
                          rather than the green one. Same condition that raises
                          the `publicIp` reason, so the icon and the rank
                          tooltip always agree. */}
                      <TableCell>
                        {!assessment.online ? (
                          <HintedIcon
                            icon={GlobeOff}
                            hint={t("iconHint.offline")}
                            className="text-red-600 dark:text-red-500"
                          />
                        ) : client.last_ip && !assessment.internalIp ? (
                          <HintedIcon
                            icon={Globe}
                            hint={t("iconHint.onlinePublicIp")}
                            className="text-amber-600 dark:text-amber-400"
                          />
                        ) : (
                          <HintedIcon
                            icon={Network}
                            hint={t("iconHint.onlineInternal")}
                            className="text-emerald-600 dark:text-emerald-400"
                          />
                        )}
                      </TableCell>
                      {/* An empty cell has two very different causes and one em
                          dash hid the difference: nobody is signed in (amber,
                          normal), or the updater is too old to report the user
                          at all (red, so the blank says nothing about the
                          machine — it is the updater that needs replacing). */}
                      <TableCell className="hidden text-sm md:table-cell">
                        {client.logged_user?.trim() ? (
                          <LoggedUserName
                            name={revealed ? client.logged_user : maskUser(client.logged_user)}
                            disconnected={isSessionDisconnected(client)}
                            hint={disconnectedSessionHint(client, t, locale)}
                          />
                        ) : updaterTooOldForLoggedUser(client.updater_version) ? (
                          <HintedIcon
                            icon={TriangleAlert}
                            hint={t("iconHint.loggedUserUnknown", {
                              version: LOGGED_USER_MIN_UPDATER_VERSION,
                            })}
                            className="text-red-600 dark:text-red-500"
                          />
                        ) : (
                          <HintedIcon
                            icon={UserX}
                            hint={t("iconHint.noLoggedUser")}
                            className="text-amber-600 dark:text-amber-400"
                          />
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-sm lg:table-cell">
                        {revealed ? client.last_ip ?? "—" : maskIp(client.last_ip)}
                      </TableCell>
                      {/* Tinted by how far behind the build is - the same gap
                          that decides the rank, so a red version here explains
                          the red bar at the start of the row. */}
                      <TableCell
                        className={cn(
                          "hidden font-mono text-sm lg:table-cell",
                          assessment.updaterGap === "minor" || assessment.updaterGap === "major"
                            ? RANK_STYLES.critical.text
                            : assessment.updaterGap === "patch"
                              ? RANK_STYLES.warning.text
                              : "text-muted-foreground",
                        )}
                        title={
                          assessment.updaterGap === "none" || assessment.updaterGap === "unknown"
                            ? undefined
                            : t("detail.latestIs", { version: latestUpdaterVersion ?? "—" })
                        }
                      >
                        {client.updater_version ?? "—"}
                      </TableCell>
                      <TableCell
                        className="hidden text-sm text-muted-foreground xl:table-cell"
                        title={new Date(client.first_seen_at).toLocaleString(locale)}
                        suppressHydrationWarning
                      >
                        {formatWhen(client.first_seen_at, now, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
                  disabled={currentPage <= 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft data-icon="inline-start" />
                  {t("table.first")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft data-icon="inline-start" />
                  {t("table.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("table.next")}
                  <ChevronRight data-icon="inline-end" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  {t("table.last")}
                  <ChevronsRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Nothing selected means no panel at all, so the table gets the full
            width rather than sitting next to an empty placeholder. */}
        {selected && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("detail.resize")}
              tabIndex={panelOpen ? 0 : -1}
              onPointerDown={startResize}
              onKeyDown={resizeByKey}
              className={cn(
                // self-stretch, because the row is items-start (so the sticky
                // panel keeps its own height) and an empty separator would
                // otherwise collapse to zero height and be undraggable.
                "hidden w-1.5 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary/50 focus-visible:outline-none lg:self-stretch",
                panelOpen && "lg:block",
              )}
            />

            <aside
              // The width lives in a custom property so it only takes effect at
              // lg, where the panel is a side column; below that it stacks and
              // spans the full width like every other block on the page.
              style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}
              className={cn(
                "w-full shrink-0 lg:sticky lg:top-6 lg:h-fit",
                panelOpen ? "lg:w-(--panel-w)" : "lg:w-10",
              )}
            >
              {panelOpen ? (
                <DeviceDetail
                  entry={selected}
                  revealed={revealed}
                  latestUpdaterVersion={latestUpdaterVersion}
                  latestAppVersion={latestAppVersion}
                  onCollapse={() => setCollapsed(true)}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                // Collapsed rail: keeps the selection alive and reachable in
                // one click, instead of making you find the row again.
                <Button
                  variant="outline"
                  onClick={() => setCollapsed(false)}
                  title={selected.client.hostname}
                  className="flex h-auto w-full items-center justify-center gap-2 py-2 lg:w-10 lg:flex-col lg:py-3"
                >
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  <span
                    className={cn("block h-2 w-2 shrink-0 rounded-full", RANK_STYLES[selected.assessment.rank].dot)}
                  />
                  <span className="lg:sr-only">{t("detail.expand")}</span>
                </Button>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sortable column header ─────────────────────────────────────────────────

function SortableHead({
  column,
  sort,
  onSort,
  className,
  children,
}: {
  column: SortColumn;
  sort: SortState | null;
  onSort: (column: SortColumn) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort?.column === column;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

interface DeviceDetailProps {
  entry: ScoredClient;
  revealed: boolean;
  latestUpdaterVersion: string | null;
  latestAppVersion: string | null;
  /** Hides the panel but keeps the row selected. */
  onCollapse: () => void;
  /** Drops the selection entirely, returning the table to full width. */
  onClose: () => void;
}

function DeviceDetail({
  entry,
  revealed,
  latestUpdaterVersion,
  latestAppVersion,
  onCollapse,
  onClose,
}: DeviceDetailProps) {
  const t = useTranslations("clients");
  const locale = useLocale();
  const { client, assessment } = entry;
  const style = RANK_STYLES[assessment.rank];
  const RankIcon = style.icon;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{client.hostname}</p>
            <p className={cn("flex items-center gap-1.5 text-sm font-medium", style.text)}>
              <RankIcon className="h-4 w-4 shrink-0" />
              {t(`rank.${assessment.rank}`)}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              aria-label={t("detail.collapse")}
              title={t("detail.collapse")}
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("detail.close")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {assessment.reasons.length > 0 && (
          <ul className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
            {assessment.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-1.5">
                <span className={cn("mt-1 block h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
                <span>{t(`reason.${reason}`)}</span>
              </li>
            ))}
          </ul>
        )}

        <Separator />

        <dl className="space-y-3">
          <Field label={t("detail.hostname")} value={client.hostname} />
          <Field
            label={t("detail.ip")}
            value={revealed ? client.last_ip ?? "—" : maskIp(client.last_ip)}
            mono
            hint={assessment.internalIp ? t("detail.ipInternal") : client.last_ip ? t("detail.ipPublic") : undefined}
          />
          <Field
            label={t("detail.connected")}
            value={assessment.online ? t("online") : t("offline")}
          />
          <Field
            label={t("detail.loggedUser")}
            value={
              client.logged_user ? (
                <LoggedUserName
                  name={revealed ? client.logged_user : maskUser(client.logged_user)}
                  disconnected={isSessionDisconnected(client)}
                  hint={disconnectedSessionHint(client, t, locale)}
                />
              ) : (
                maskUser(client.logged_user)
              )
            }
            // A snapshot from the last sighting: a machine that stopped checking
            // in (or runs an updater older than 1.6.2, which never clears it)
            // still shows its last known user. Dating it stops that reading as
            // "logged on right now".
            hint={
              client.logged_user
                ? t("detail.loggedUserAsOf", { date: new Date(client.last_seen_at).toLocaleString(locale) })
                : undefined
            }
          />
          <Field
            label={t("detail.serial")}
            value={revealed ? client.serial ?? "—" : maskSerial(client.serial)}
            mono
          />
          <Field label={t("detail.lastSeen")} value={new Date(client.last_seen_at).toLocaleString(locale)} />
          <Field label={t("detail.createdAt")} value={new Date(client.first_seen_at).toLocaleString(locale)} />
          {/* Reported since updater 1.6.3; the hint tells a machine that has
              not said yet from one whose value is simply blank. */}
          <Field
            label={t("detail.os")}
            value={client.os_version ?? "—"}
            hint={client.os_version ? undefined : t("detail.notReported")}
          />
          <Field
            label={t("detail.updaterVersion")}
            value={client.updater_version ?? "—"}
            mono
            hint={
              assessment.updaterGap === "none"
                ? t("detail.upToDate")
                : latestUpdaterVersion
                  ? t("detail.latestIs", { version: latestUpdaterVersion })
                  : undefined
            }
          />
          {/* The EMLy build on the machine, not this updater's own - the two
              move independently, so they sit as separate fields and the hint
              names the release the app manifest is currently serving. */}
          <Field
            label={t("detail.appVersion")}
            value={client.emly_version ?? "—"}
            mono
            hint={
              !client.emly_version
                ? latestAppVersion
                  ? `${t("detail.notReported")} · ${t("detail.latestIs", { version: latestAppVersion })}`
                  : t("detail.notReported")
                : assessment.appGap === "none"
                  ? t("detail.upToDate")
                  : latestAppVersion
                    ? t("detail.latestIs", { version: latestAppVersion })
                    : undefined
            }
          />
          <Field
            label={t("detail.dc")}
            value={assessment.dcSites.length > 0 ? assessment.dcSites.join(", ") : "—"}
            // Sites overlap by design, so more than one name here is correct
            // rather than a bug; an empty list means the address is in no
            // site's subnets, which is not the same as being off-network.
            hint={assessment.dcSites.length === 0 ? t("detail.dcUnmapped") : undefined}
          />
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t("detail.banned")}</dt>
            <dd className="mt-0.5">
              {assessment.bans.length === 0 ? (
                <span className="text-sm font-medium">{t("detail.notBanned")}</span>
              ) : (
                <ul className="space-y-1">
                  {assessment.bans.map((ban) => (
                    <li key={ban.id} className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                      <BanIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {t(`banType.${ban.ban_type}`)}: {ban.value}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <Field label={t("detail.adDomain")} value={client.ad_domain || "—"} />
        </dl>

        <Button variant="outline" size="sm" asChild className="w-full">
          <Link href={`/statistics/clients/${client.id}`}>
            {t("detail.openFull")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <span className={cn("text-sm font-medium wrap-break-word", mono && "font-mono")}>{value}</span>
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}
