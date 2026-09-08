"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Ban, BanType } from "@/lib/api";
import { deleteBanAction } from "@/lib/actions/bans";
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
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import { Search, Trash2, X } from "lucide-react";

// Radix reserves "" as an item value, same sentinel the stats filters use.
const ANY = "__any__";

export function BansTable({ bans, isAdmin }: { bans: Ban[]; isAdmin: boolean }) {
  const [deleteTarget, setDeleteTarget] = useState<Ban | null>(null);
  const [type, setType] = useState<string>(ANY);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("bans");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bans.filter((ban) => {
      if (type !== ANY && ban.ban_type !== type) return false;
      if (!q) return true;
      // The reason is searchable too: after an incident the thing an
      // operator remembers is usually why, not the exact HWID they pasted.
      return (
        ban.value.toLowerCase().includes(q) || (ban.reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [bans, type, search]);

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      await deleteBanAction(id);
      toast.success(t("table.removed"));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("filters.search")}
            value={search}
            className="pl-8"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("filters.allTypes")}</SelectItem>
            <SelectItem value="ip">{t("type.ip")}</SelectItem>
            <SelectItem value="hwid">{t("type.hwid")}</SelectItem>
            <SelectItem value="hostname">{t("type.hostname")}</SelectItem>
          </SelectContent>
        </Select>

        {(type !== ANY || search !== "") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setType(ANY);
              setSearch("");
            }}
          >
            <X className="h-4 w-4" />
            {t("filters.reset")}
          </Button>
        )}

        <p className="ml-auto text-sm text-muted-foreground">
          {t("filters.count", { shown: filtered.length, total: bans.length })}
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead>{t("table.value")}</TableHead>
              <TableHead>{t("table.reason")}</TableHead>
              <TableHead>{t("table.createdBy")}</TableHead>
              <TableHead>{t("table.createdAt")}</TableHead>
              {isAdmin && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 6 : 5}
                  className="text-center text-muted-foreground py-8"
                >
                  {bans.length === 0 ? t("table.noBans") : t("table.noMatches")}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((ban) => (
              <TableRow key={ban.id}>
                <TableCell>
                  <BanTypeBadge type={ban.ban_type} />
                </TableCell>
                <TableCell className="font-mono text-sm">{ban.value}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ban.reason ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ban.created_by ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(ban.created_at).toLocaleString()}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => setDeleteTarget(ban)}
                      aria-label={t("table.remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDialog.description", { value: deleteTarget?.value ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("removeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function BanTypeBadge({ type }: { type: BanType }) {
  const t = useTranslations("bans");
  return <Badge variant="secondary">{t(`type.${type}`)}</Badge>;
}
