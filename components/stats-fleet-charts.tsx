"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UpdaterClient } from "@/lib/api";
import {
  compareVersions,
  presenceState,
  SESSION_STATES,
  sessionState,
  type PresenceState,
  type SessionState,
} from "@/lib/device-status";
import { shortOsLabel } from "@/lib/os-label";
import { clientsHref, type ClientsUrlFilters } from "@/lib/clients-filters";
import { useLiveStatsClients } from "@/hooks/use-stats-stream";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
// Same cadence as the clients explorer: presence and age both turn on the
// clock, so it has to move even when no push arrives.
const CLOCK_REFRESH_MS = 30_000;

// Rows past this fold into "other": a long tail of one-machine builds says
// nothing a single summed row doesn't.
const MAX_VERSION_ROWS = 6;
const MAX_OS_ROWS = 6;

// Same hues as PresenceDot, stepped per mode so both clear 3:1 against the
// card. Offline stays neutral: it is the absence of a signal, not a third
// status to read as a fault.
const PRESENCE_STYLES: Record<PresenceState, string> = {
  live: "bg-emerald-600 dark:bg-emerald-400",
  estimated: "bg-amber-600 dark:bg-amber-400",
  offline: "bg-chart-2",
};
const PRESENCE_ORDER: PresenceState[] = ["live", "estimated", "offline"];

// The clients explorer has no presence filter as such, but its WS and
// connection filters pin each state down exactly: live is the WS being up;
// estimated is online without it; offline is the connection column's own
// offline entry.
const PRESENCE_FILTERS: Record<PresenceState, ClientsUrlFilters> = {
  live: { ws: "connected" },
  estimated: { ws: "disconnected", connected: ["internal", "public"] },
  offline: { connected: ["offline"] },
};

const AGE_BUCKETS = ["hour", "day", "week", "month", "older"] as const;
type AgeBucket = (typeof AGE_BUCKETS)[number];

function ageBucket(iso: string, now: number): AgeBucket | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const elapsed = now - then;
  if (elapsed < HOUR_MS) return "hour";
  if (elapsed < DAY_MS) return "day";
  if (elapsed < 7 * DAY_MS) return "week";
  if (elapsed < 30 * DAY_MS) return "month";
  return "older";
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

interface BarRow {
  key: string;
  label: string;
  count: number;
  highlight?: boolean;
  /** Short text next to the label, so the highlight never rests on color alone. */
  tag?: string;
  muted?: boolean;
  /** Where clicking the row leads: /clients filtered down to these machines. */
  href: string;
}

/**
 * Counts machines per key and remembers each key's raw values, so a row's
 * link filters on exactly what the clients explorer matches - an untrimmed
 * or missing value included, as its "(blank)" entry.
 */
function tally(values: (string | null | undefined)[], keyOf: (raw: string) => string | null) {
  const groups = new Map<string, { count: number; raws: Set<string> }>();
  const unknown = { count: 0, raws: new Set<string>() };
  for (const value of values) {
    const raw = value ?? "";
    const key = keyOf(raw);
    const group = key ? (groups.get(key) ?? { count: 0, raws: new Set<string>() }) : unknown;
    group.count += 1;
    group.raws.add(raw);
    if (key) groups.set(key, group);
  }
  return { groups, unknown };
}

/**
 * Horizontal bars as plain rows: label and value sit as text above each bar,
 * which keeps long labels (OS strings run to 50 characters) readable at any
 * width, where an axis would have to truncate them.
 */
function BarList({ rows, total, mono = true }: { rows: BarRow[]; total: number; mono?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <Link
              href={row.href}
              className={cn(
                "min-w-0 truncate underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none",
                row.muted ? "text-muted-foreground" : mono && "font-mono",
              )}
              title={row.label}
            >
              {row.label}
              {row.tag && (
                <span className="ml-2 font-sans text-xs font-medium text-muted-foreground">{row.tag}</span>
              )}
            </Link>
            <span className="shrink-0 font-mono tabular-nums">
              {row.count}
              <span className="ml-1.5 text-muted-foreground">{percent(row.count, total)}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                row.highlight ? "bg-emerald-600 dark:bg-emerald-400" : "bg-chart-2",
              )}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

// ── Presence ───────────────────────────────────────────────────────────────

function PresenceCard({ counts, total }: { counts: Record<PresenceState, number>; total: number }) {
  const t = useTranslations("statistics.fleet.presence");
  const online = counts.live + counts.estimated;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <EmptyNote text={t("noData")} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="mr-1.5 text-2xl font-bold tabular-nums text-foreground">
                {percent(online, total)}%
              </span>
              {t("online", { online, total })}
            </p>
            {/* gap-0.5 is the 2px surface gap between segments. */}
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("title")}>
              {PRESENCE_ORDER.filter((state) => counts[state] > 0).map((state) => (
                <div
                  key={state}
                  className={PRESENCE_STYLES[state]}
                  style={{ flexGrow: counts[state] }}
                  title={`${t(state)}: ${counts[state]}`}
                />
              ))}
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {PRESENCE_ORDER.map((state) => (
                <li key={state}>
                  <Link
                    href={clientsHref(PRESENCE_FILTERS[state])}
                    className="group flex items-center gap-2 text-sm focus-visible:outline-none"
                  >
                    <span className={cn("size-2.5 shrink-0 rounded-full", PRESENCE_STYLES[state])} />
                    <span className="text-muted-foreground underline-offset-4 group-hover:text-foreground group-hover:underline group-focus-visible:underline">
                      {t(state)}
                    </span>
                    <span className="ml-auto font-mono tabular-nums sm:ml-1">{counts[state]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Version adoption ───────────────────────────────────────────────────────

function versionRows(
  versions: (string | null | undefined)[],
  latest: string | null,
  filterKey: "updaterVersion" | "emlyVersion",
  labels: { unknown: string; other: string; latest: string },
): BarRow[] {
  const { groups, unknown } = tally(versions, (raw) => raw.trim() || null);
  const href = (raws: Iterable<string>) => clientsHref({ [filterKey]: [...raws] });

  // Newest first, so the bars read as a rollout from the top down.
  const sorted = [...groups.entries()].sort(
    ([a], [b]) => compareVersions(b, a) ?? b.localeCompare(a),
  );
  const shown = sorted.slice(0, MAX_VERSION_ROWS);
  const rest = sorted.slice(MAX_VERSION_ROWS);

  const rows: BarRow[] = shown.map(([version, { count, raws }]) => {
    const isLatest = latest !== null && compareVersions(version, latest) === 0;
    return {
      key: version,
      label: version,
      count,
      highlight: isLatest,
      tag: isLatest ? labels.latest : undefined,
      href: href(raws),
    };
  });
  if (rest.length > 0) {
    rows.push({
      key: "__other",
      label: labels.other,
      count: rest.reduce((sum, [, g]) => sum + g.count, 0),
      muted: true,
      href: href(rest.flatMap(([, g]) => [...g.raws])),
    });
  }
  if (unknown.count > 0) {
    rows.push({ key: "__unknown", label: labels.unknown, count: unknown.count, muted: true, href: href(unknown.raws) });
  }
  return rows;
}

function VersionAdoptionCard({
  title,
  versions,
  latest,
  filterKey,
  unknownLabel,
}: {
  title: string;
  versions: (string | null | undefined)[];
  latest: string | null;
  filterKey: "updaterVersion" | "emlyVersion";
  unknownLabel: string;
}) {
  const t = useTranslations("statistics.fleet.versions");
  const total = versions.length;
  const rows = useMemo(
    () =>
      versionRows(versions, latest, filterKey, {
        unknown: unknownLabel,
        other: t("other"),
        latest: t("latestTag"),
      }),
    [versions, latest, filterKey, unknownLabel, t],
  );
  // Ahead of the manifest counts as current, the same call versionGap makes.
  const current = latest
    ? versions.filter((v) => {
        const cmp = v ? compareVersions(v.trim(), latest) : null;
        return cmp !== null && cmp >= 0;
      }).length
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {latest ? t("latest", { version: latest }) : t("latestUnknown")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <EmptyNote text={t("noData")} />
        ) : (
          <>
            {latest && (
              <p className="text-sm text-muted-foreground">
                <span className="mr-1.5 text-2xl font-bold tabular-nums text-foreground">
                  {percent(current, total)}%
                </span>
                {t("upToDate", { current, total })}
              </p>
            )}
            <BarList rows={rows} total={total} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── User sessions ──────────────────────────────────────────────────────────

function SessionsCard({ counts, total }: { counts: Record<SessionState, number>; total: number }) {
  const t = useTranslations("statistics.fleet.sessions");
  // Every state stays listed, zero included, so the card reads the same way
  // the clients table's logged-user cell does: five cases, always the same five.
  const rows: BarRow[] = SESSION_STATES.map((state) => ({
    key: state,
    label: t(state),
    count: counts[state],
    muted: state === "unknown",
    href: clientsHref({ session: [state] }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? <EmptyNote text={t("noData")} /> : <BarList rows={rows} total={total} mono={false} />}
      </CardContent>
    </Card>
  );
}

// ── Last seen ──────────────────────────────────────────────────────────────

function LastSeenCard({ counts }: { counts: Record<AgeBucket, number> }) {
  const t = useTranslations("statistics.fleet.lastSeen");
  const router = useRouter();
  const open = (bucket: string) => router.push(clientsHref({ lastSeen: [bucket] }));
  const data = AGE_BUCKETS.map((bucket) => ({ bucket, count: counts[bucket] }));
  const total = data.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyNote text={t("noData")} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="bucket"
                tick={({ x, y, payload }) => (
                  <text
                    x={x}
                    y={y}
                    dy={12}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--muted-foreground)"
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer hover:fill-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                    onClick={() => open(payload.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(payload.value);
                    }}
                  >
                    {t(`bucket.${payload.value}`)}
                  </text>
                )}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                labelFormatter={(bucket) => t(`bucket.${bucket}`)}
                formatter={(value) => [value, t("clients")]}
              />
              <Bar
                dataKey="count"
                fill="var(--chart-2)"
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                className="cursor-pointer"
                onClick={(entry) => open(entry.payload.bucket)}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Operating systems ──────────────────────────────────────────────────────

/**
 * Grouped on `shortOsLabel`, the same name the clients table shows, so every
 * build of one release lands on one row. A string it doesn't recognise comes
 * back untouched and simply gets a row of its own.
 */
function OsCard({ clients }: { clients: UpdaterClient[] }) {
  const t = useTranslations("statistics.fleet.os");
  const rows = useMemo<BarRow[]>(() => {
    // Keyed exactly as the explorer's OS column: shortOsLabel, or "" for none.
    const labels = clients.map((client) => shortOsLabel(client.os_version) ?? "");
    const { groups, unknown } = tally(labels, (label) => label || null);
    const href = (keys: string[]) => clientsHref({ os: keys });

    const sorted = [...groups.entries()].sort(([a, ga], [b, gb]) => gb.count - ga.count || a.localeCompare(b));
    const shown: BarRow[] = sorted
      .slice(0, MAX_OS_ROWS)
      .map(([os, { count }]) => ({ key: os, label: os, count, href: href([os]) }));
    const rest = sorted.slice(MAX_OS_ROWS);
    if (rest.length > 0) {
      shown.push({
        key: "__other",
        label: t("other"),
        count: rest.reduce((sum, [, g]) => sum + g.count, 0),
        muted: true,
        href: href(rest.map(([os]) => os)),
      });
    }
    if (unknown.count > 0) {
      shown.push({ key: "__unknown", label: t("unknown"), count: unknown.count, muted: true, href: href([""]) });
    }
    return shown;
  }, [clients, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? <EmptyNote text={t("noData")} /> : <BarList rows={rows} total={clients.length} />}
      </CardContent>
    </Card>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

export function StatsFleetCharts({
  renderedAt,
  windowMinutes,
  latestUpdaterVersion,
  latestAppVersion,
}: {
  /**
   * Server clock at render. Presence and age both depend on "now", so the
   * first client render must use the instant the server did or it hydrates
   * to different counts.
   */
  renderedAt: number;
  windowMinutes: number;
  latestUpdaterVersion: string | null;
  latestAppVersion: string | null;
}) {
  const t = useTranslations("statistics.fleet");
  const { clients } = useLiveStatsClients();
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const presence = useMemo(() => {
    const counts: Record<PresenceState, number> = { live: 0, estimated: 0, offline: 0 };
    for (const client of clients) counts[presenceState(client, now, windowMinutes)] += 1;
    return counts;
  }, [clients, now, windowMinutes]);

  const sessions = useMemo(() => {
    const counts = Object.fromEntries(SESSION_STATES.map((s) => [s, 0])) as Record<SessionState, number>;
    for (const client of clients) {
      const online = presenceState(client, now, windowMinutes) !== "offline";
      counts[sessionState(client, online)] += 1;
    }
    return counts;
  }, [clients, now, windowMinutes]);

  const ages = useMemo(() => {
    const counts = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>;
    for (const client of clients) {
      const bucket = ageBucket(client.last_seen_at, now);
      if (bucket) counts[bucket] += 1;
    }
    return counts;
  }, [clients, now]);

  const emlyVersions = useMemo(() => clients.map((c) => c.emly_version), [clients]);
  const updaterVersions = useMemo(() => clients.map((c) => c.updater_version), [clients]);

  return (
    <section>
      <div className="grid gap-4 lg:grid-cols-2">
        <PresenceCard counts={presence} total={clients.length} />
        <SessionsCard counts={sessions} total={clients.length} />
        <VersionAdoptionCard
          title={t("versions.emlyTitle")}
          versions={emlyVersions}
          latest={latestAppVersion}
          filterKey="emlyVersion"
          unknownLabel={t("versions.emlyUnknown")}
        />
        <VersionAdoptionCard
          title={t("versions.updaterTitle")}
          versions={updaterVersions}
          latest={latestUpdaterVersion}
          filterKey="updaterVersion"
          unknownLabel={t("versions.updaterUnknown")}
        />
        <LastSeenCard counts={ages} />
        <OsCard clients={clients} />
      </div>
    </section>
  );
}
