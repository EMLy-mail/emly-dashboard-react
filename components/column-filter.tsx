"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownAZ, ArrowUpAZ, Filter, FilterX, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * One line of the value list. `keys` is plural because several raw values
 * can render the same: with sensitive data hidden, every 10.0.x.x address
 * reads "10.0.***.***", and listing that line forty times would be useless.
 * Ticking the line ticks every value behind it.
 */
export interface ColumnFilterOption {
  label: string;
  keys: string[];
  count: number;
}

interface ColumnFilterProps {
  /** Column name, for the trigger's accessible label. */
  column: string;
  /** Already in display order. */
  options: ColumnFilterOption[];
  /** Raw values let through; null means the column is not filtered. */
  selected: Set<string> | null;
  onApply: (next: Set<string> | null) => void;
  sortDirection: "asc" | "desc" | null;
  onSort: (direction: "asc" | "desc") => void;
}

/**
 * Excel-style column menu: sort, search the column's values, tick the ones
 * to keep, confirm with OK. Edits stay in a draft until OK, so closing the
 * menu any other way leaves the table as it was.
 */
export function ColumnFilter({ column, options, selected, onApply, sortDirection, onSort }: ColumnFilterProps) {
  const t = useTranslations("clients.columnFilter");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const allKeys = useMemo(() => options.flatMap((o) => o.keys), [options]);
  const needle = search.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const shownKeys = shown.flatMap((o) => o.keys);
  const active = selected !== null;

  function openChange(next: boolean) {
    if (next) {
      setSearch("");
      setDraft(new Set(selected ?? allKeys));
    }
    setOpen(next);
  }

  function toggle(keys: string[], on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function apply() {
    // A search narrows the result to what it matched, as in Excel: values
    // the search hid are dropped rather than kept from the old selection.
    // So are values no row offers any more, which keeps "everything ticked"
    // meaning "no filter" instead of a filter nobody can see.
    const kept = (needle ? shownKeys : allKeys).filter((k) => draft.has(k));
    onApply(kept.length === allKeys.length ? null : new Set(kept));
    setOpen(false);
  }

  function sortAndClose(direction: "asc" | "desc") {
    onSort(direction);
    setOpen(false);
  }

  const shownChecked = shownKeys.filter((k) => draft.has(k)).length;
  const keptCount = needle ? shownChecked : allKeys.filter((k) => draft.has(k)).length;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("open", { column })}
          title={t("open", { column })}
          className={cn(
            "rounded-sm p-0.5 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-primary" : "text-muted-foreground/70",
          )}
        >
          <Filter className={cn("h-3.5 w-3.5", active && "fill-current")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2 font-normal">
        <div className="space-y-0.5">
          <MenuButton onClick={() => sortAndClose("asc")} pressed={sortDirection === "asc"}>
            <ArrowDownAZ className="h-4 w-4" />
            {t("sortAsc")}
          </MenuButton>
          <MenuButton onClick={() => sortAndClose("desc")} pressed={sortDirection === "desc"}>
            <ArrowUpAZ className="h-4 w-4" />
            {t("sortDesc")}
          </MenuButton>
          <MenuButton
            onClick={() => {
              onApply(null);
              setOpen(false);
            }}
            disabled={!active}
          >
            <FilterX className="h-4 w-4" />
            {t("clear", { column })}
          </MenuButton>
        </div>

        <Separator />

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keptCount > 0) apply();
            }}
            className="h-9 pl-8"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
          ) : (
            <>
              <CheckRow
                label={needle ? t("selectAllResults") : t("selectAll")}
                checked={shownChecked === shownKeys.length}
                indeterminate={shownChecked > 0 && shownChecked < shownKeys.length}
                onChange={(on) => toggle(shownKeys, on)}
                className="font-medium"
              />
              {shown.map((option) => {
                const checkedKeys = option.keys.filter((k) => draft.has(k)).length;
                return (
                  <CheckRow
                    key={option.keys.join("\u0000")}
                    label={option.label}
                    count={option.count}
                    checked={checkedKeys === option.keys.length}
                    indeterminate={checkedKeys > 0 && checkedKeys < option.keys.length}
                    onChange={(on) => toggle(option.keys, on)}
                  />
                );
              })}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={apply} disabled={keptCount === 0}>
            {t("ok")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MenuButton({
  onClick,
  pressed,
  disabled,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50",
        pressed && "font-medium text-primary",
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({
  label,
  count,
  checked,
  indeterminate,
  onChange,
  className,
}: {
  label: string;
  count?: number;
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent",
        className,
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-primary"
        checked={checked}
        // Indeterminate has no attribute, only the DOM property.
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>}
    </label>
  );
}
