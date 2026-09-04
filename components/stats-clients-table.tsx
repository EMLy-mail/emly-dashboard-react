"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import type { UpdaterClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 20;
// Sentinel values for the select filters: Radix reserves "" as an item value.
const ANY = "__any__";
const UNKNOWN = "__unknown__";

function isOnlineAt(client: UpdaterClient, now: number, windowMinutes: number) {
  return now - new Date(client.last_seen_at).getTime() <= windowMinutes * 60_000;
}

interface StatsClientsTableProps {
  data: UpdaterClient[] | null;
  windowMinutes: number;
}

interface Filters {
  hostname: string;
  ip: string;
  version: string;
  adDomain: string;
  status: string;
}

const EMPTY_FILTERS: Filters = {
  hostname: "",
  ip: "",
  version: ANY,
  adDomain: ANY,
  status: ANY,
};

type SortColumn =
  | "hostname"
  | "adDomain"
  | "version"
  | "lastIp"
  | "status"
  | "firstSeen"
  | "lastSeen";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection };

function compareStrings(a: string, b: string) {
  // Empty/unknown values always sort last, regardless of direction.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function StatsClientsTable({ data: rawData, windowMinutes }: StatsClientsTableProps) {
  const data = useMemo(() => rawData ?? [], [rawData]);
  const t = useTranslations("statistics.clients");
  // Captured once per mount rather than read live during render, per React's
  // component-purity rules (no impure calls like Date.now() in the render body).
  const [now] = useState(() => Date.now());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);

  function toggleSort(column: SortColumn) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
    setPage(1);
  }

  // The stats API exposes no search parameters, so the page loads the whole client
  // list (a few hundred rows at most) and every filter below runs in the browser.
  function setFilter(patch: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  const versions = useMemo(
    () =>
      Array.from(new Set(data.map((c) => c.updater_version ?? UNKNOWN))).sort((a, b) =>
        a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : b.localeCompare(a, undefined, { numeric: true }),
      ),
    [data],
  );

  const adDomains = useMemo(
    () =>
      Array.from(new Set(data.map((c) => c.ad_domain || UNKNOWN))).sort((a, b) =>
        a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : a.localeCompare(b),
      ),
    [data],
  );

  const filtered = useMemo(() => {
    const hostname = filters.hostname.trim().toLowerCase();
    const ip = filters.ip.trim().toLowerCase();

    return data.filter((client) => {
      if (hostname && !client.hostname.toLowerCase().includes(hostname)) return false;
      if (ip && !(client.last_ip ?? "").toLowerCase().includes(ip)) return false;
      if (filters.version !== ANY && (client.updater_version ?? UNKNOWN) !== filters.version) return false;
      if (filters.adDomain !== ANY && (client.ad_domain || UNKNOWN) !== filters.adDomain) return false;
      if (filters.status !== ANY) {
        const online = isOnlineAt(client, now, windowMinutes);
        if (filters.status === "online" && !online) return false;
        if (filters.status === "offline" && online) return false;
      }
      return true;
    });
  }, [data, filters, now, windowMinutes]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.direction === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      switch (sort.column) {
        case "hostname":
          return dir * compareStrings(a.hostname, b.hostname);
        case "adDomain":
          return dir * compareStrings(a.ad_domain, b.ad_domain);
        case "version":
          return dir * compareStrings(a.updater_version ?? "", b.updater_version ?? "");
        case "lastIp":
          return dir * compareStrings(a.last_ip ?? "", b.last_ip ?? "");
        case "status": {
          const aOnline = isOnlineAt(a, now, windowMinutes) ? 1 : 0;
          const bOnline = isOnlineAt(b, now, windowMinutes) ? 1 : 0;
          return dir * (aOnline - bOnline);
        }
        case "firstSeen":
          return (
            dir * (new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime())
          );
        case "lastSeen":
          return dir * (new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime());
        default:
          return 0;
      }
    });
  }, [filtered, sort, now, windowMinutes]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const isFiltered =
    filters.hostname !== "" ||
    filters.ip !== "" ||
    filters.version !== ANY ||
    filters.adDomain !== ANY ||
    filters.status !== ANY;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("filters.count", { shown: filtered.length, total: data.length })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("filters.hostname")}
            value={filters.hostname}
            className="pl-8"
            onChange={(e) => setFilter({ hostname: e.target.value })}
          />
        </div>

        <div className="relative w-full sm:w-44">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("filters.ip")}
            value={filters.ip}
            className="pl-8 font-mono"
            onChange={(e) => setFilter({ ip: e.target.value })}
          />
        </div>

        <Select value={filters.version} onValueChange={(v) => setFilter({ version: v })}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allVersions")}</SelectItem>
            {versions.map((version) => (
              <SelectItem key={version} value={version}>
                {version === UNKNOWN ? t("filters.unknown") : version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.adDomain} onValueChange={(v) => setFilter({ adDomain: v })}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allDomains")}</SelectItem>
            {adDomains.map((domain) => (
              <SelectItem key={domain} value={domain}>
                {domain === UNKNOWN ? t("filters.unknown") : domain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => setFilter({ status: v })}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allStatuses")}</SelectItem>
            <SelectItem value="online">{t("table.online")}</SelectItem>
            <SelectItem value="offline">{t("table.offline")}</SelectItem>
          </SelectContent>
        </Select>

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => setFilter(EMPTY_FILTERS)}>
            <X className="h-4 w-4" />
            {t("filters.reset")}
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="hostname" sort={sort} onSort={toggleSort}>
                {t("table.hostname")}
              </SortableTableHead>
              <SortableTableHead column="adDomain" sort={sort} onSort={toggleSort}>
                {t("table.adDomain")}
              </SortableTableHead>
              <SortableTableHead column="version" sort={sort} onSort={toggleSort}>
                {t("table.version")}
              </SortableTableHead>
              <SortableTableHead column="lastIp" sort={sort} onSort={toggleSort}>
                {t("table.lastIp")}
              </SortableTableHead>
              <SortableTableHead column="status" sort={sort} onSort={toggleSort}>
                {t("table.status")}
              </SortableTableHead>
              <SortableTableHead column="firstSeen" sort={sort} onSort={toggleSort}>
                {t("table.firstSeen")}
              </SortableTableHead>
              <SortableTableHead column="lastSeen" sort={sort} onSort={toggleSort}>
                {t("table.lastSeen")}
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {visible.map((client) => {
              const online = isOnlineAt(client, now, windowMinutes);
              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link href={`/statistics/clients/${client.id}`} className="font-medium hover:underline">
                      {client.hostname}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{client.ad_domain}</TableCell>
                  <TableCell className="font-mono text-sm">{client.updater_version ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{client.last_ip ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={online ? "outline" : "secondary"}>
                      {online ? t("table.online") : t("table.offline")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(client.first_seen_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(client.last_seen_at).toLocaleString()}
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
              onClick={() => setPage(currentPage - 1)}
            >
              {t("table.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("table.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableTableHeadProps {
  column: SortColumn;
  sort: SortState | null;
  onSort: (column: SortColumn) => void;
  children: ReactNode;
}

function SortableTableHead({ column, sort, onSort, children }: SortableTableHeadProps) {
  const active = sort?.column === column;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}
