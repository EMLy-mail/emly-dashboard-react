import type { UserRole } from "@/lib/api";

// No `server-only`: the sidebar (client) and the pages/actions (server) must
// agree on who sees the download queue.
const DOWNLOAD_QUEUE_ROLES: readonly UserRole[] = ["admin", "owner"];

export function canManageDownloadQueue(role: UserRole | undefined): boolean {
  return role !== undefined && DOWNLOAD_QUEUE_ROLES.includes(role);
}
