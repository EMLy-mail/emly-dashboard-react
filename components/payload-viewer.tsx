"use client";

import { JsonViewer } from "@/components/arc/json-viewer/json-viewer";
import { cn } from "@/lib/utils";

/**
 * A JSON payload (WebSocket event, command result) as a collapsible tree.
 * Wraps the Arc viewer with the .arc-theme token mapping from globals.css,
 * which it needs to pick up this app's colors in both themes.
 */
export function PayloadViewer({
  data,
  rootName = "payload",
  maxHeight = 320,
  className,
}: {
  data: unknown;
  rootName?: string;
  maxHeight?: number;
  className?: string;
}) {
  return (
    <JsonViewer
      data={data}
      rootName={rootName}
      defaultExpandDepth={2}
      maxHeight={maxHeight}
      className={cn("arc-theme", className)}
    />
  );
}
