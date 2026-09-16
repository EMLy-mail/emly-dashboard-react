"use client";

import { Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The logged-user string, marked when its session is disconnected: an
 * <Unplug /> in front and the name slightly faded, so a session left behind
 * does not read as someone sitting at the machine. `hint` is both the
 * tooltip and the icon's accessible name; the wrapper span is what takes
 * focus, since an inline SVG is not tabbable.
 *
 * Used from server components too (the client detail page), so every prop is
 * serialisable and the caller resolves the translated hint.
 */
export function LoggedUserName({
  name,
  disconnected,
  hint,
  className,
}: {
  name: string;
  disconnected: boolean;
  hint?: string;
  className?: string;
}) {
  if (!disconnected) return <span className={className}>{name}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex shrink-0 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
          >
            <Unplug className="h-3.5 w-3.5" role="img" aria-label={hint} />
          </span>
        </TooltipTrigger>
        {hint && <TooltipContent>{hint}</TooltipContent>}
      </Tooltip>
      <span className="opacity-70">{name}</span>
    </span>
  );
}
