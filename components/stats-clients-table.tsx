"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { UpdaterClient } from "@/lib/api";
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

interface StatsClientsTableProps {
  data: UpdaterClient[] | null;
  totalPages: number;
  currentPage: number;
  online: boolean;
  windowMinutes: number;
}

export function StatsClientsTable({
  data: rawData,
  totalPages,
  currentPage,
  online,
  windowMinutes,
}: StatsClientsTableProps) {
  const data = rawData ?? [];
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("statistics.clients");
  // Captured once per mount rather than read live during render, per React's
  // component-purity rules (no impure calls like Date.now() in the render body).
  const [now] = useState(() => Date.now());

  function navigate(next: { page?: number; online?: boolean }) {
    const params = new URLSearchParams();
    params.set("page", String(next.page ?? currentPage));
    if (next.online ?? online) params.set("online", "true");
    router.push(`${pathname}?${params.toString()}`);
  }

  function isOnline(client: UpdaterClient) {
    const lastSeen = new Date(client.last_seen_at).getTime();
    return now - lastSeen <= windowMinutes * 60_000;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Button
          variant={online ? "default" : "outline"}
          size="sm"
          onClick={() => navigate({ page: 1, online: !online })}
        >
          {t("onlineOnly")}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.hostname")}</TableHead>
              <TableHead>{t("table.adDomain")}</TableHead>
              <TableHead>{t("table.version")}</TableHead>
              <TableHead>{t("table.lastIp")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.firstSeen")}</TableHead>
              <TableHead>{t("table.lastSeen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("table.noData")}
                </TableCell>
              </TableRow>
            )}
            {data.map((client) => (
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
                  <Badge variant={isOnline(client) ? "outline" : "secondary"}>
                    {isOnline(client) ? t("table.online") : t("table.offline")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(client.first_seen_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(client.last_seen_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
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
              onClick={() => navigate({ page: currentPage - 1 })}
            >
              {t("table.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => navigate({ page: currentPage + 1 })}
            >
              {t("table.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
