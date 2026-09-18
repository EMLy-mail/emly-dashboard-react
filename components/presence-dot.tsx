"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PresenceState } from "@/lib/device-status";

/**
 * Sits next to the existing online/offline icon and answers what that icon
 * alone cannot: is "online" a fact the client is reporting right now over
 * its presence WebSocket, or an estimate carried over from the last poll
 * inside the detection window? Nothing renders for "offline" - the icon it
 * sits beside already says so, and a third dot state there would just
 * repeat it.
 *
 * The pulse is reserved for "live" on purpose: it is the one state backed by
 * a connection that is open *right now*, and the animation is what makes
 * that immediacy legible at a glance, next to a plain filled dot for
 * "estimated" that has no such claim to make.
 */
export function PresenceDot({ state, hint }: { state: PresenceState; hint: string }) {
  if (state === "offline") return null;

  const live = state === "live";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-2 w-2 shrink-0 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span
            role="img"
            aria-label={hint}
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              live ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
