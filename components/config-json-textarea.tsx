"use client";

import { cn } from "@/lib/utils";

/**
 * Plain monospace textarea for editing/viewing a remote-config document as
 * raw JSON. There is no structured per-field editor (see `lib/api.ts`'s
 * `RemoteConfigDocument` comment) — the document schema is validated
 * server-side, and a typo surfaces as a `ConfigProblemsList` entry rather
 * than being caught here.
 */
export function ConfigJsonTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      spellCheck={false}
      className={cn(
        "flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
