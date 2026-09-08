import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Pretty-prints a remote-config document for display. The API types it as
 * an object, but some endpoints hand it back JSON-encoded as a string
 * (double-encoded) — parse first so the viewer shows real formatted JSON
 * instead of one big escaped string.
 */
export function formatConfigDocument(document: unknown): string {
  let value = document
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      // Not actually JSON — fall through and show it as-is.
    }
  }
  return JSON.stringify(value, null, 2)
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
