import { windowsMajor } from "@/lib/os-label";
import { cn } from "@/lib/utils";

// Paths from Font Awesome Free 7.3.1 (brands, solid), https://fontawesome.com/license/free
// Copyright 2026 Fonticons, Inc. Inlined so the icons need neither the paid kit nor a package.
const WINDOWS_PATH =
  "M96 157.7L279.6 132.4L279.6 309.8L96 309.8L96 157.7zM96 482.3L279.6 507.6L279.6 332.4L96 332.4L96 482.3zM299.8 510.3L544 544L544 332.4L299.8 332.4L299.8 510.3zM299.8 129.7L299.8 309.8L544 309.8L544 96L299.8 129.7z";
const MICROSOFT_PATH =
  "M96 96L310.6 96L310.6 310.6L96 310.6L96 96zM329.4 96L544 96L544 310.6L329.4 310.6L329.4 96zM96 329.4L310.6 329.4L310.6 544L96 544L96 329.4zM329.4 329.4L544 329.4L544 544L329.4 544L329.4 329.4z";

/** Windows logo for Windows 10, four-square Microsoft logo for Windows 11; nothing otherwise. */
export function OsIcon({ osVersion, className }: { osVersion: string | null | undefined; className?: string }) {
  const major = windowsMajor(osVersion);
  if (!major) return null;
  return (
    <svg
      viewBox="0 0 640 640"
      fill="currentColor"
      aria-hidden="true"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <path d={major === 10 ? WINDOWS_PATH : MICROSOFT_PATH} />
    </svg>
  );
}
