"use server";

import {
  ApiError,
  evictAllDownloadQueueSlots,
  evictDownloadQueueSlot,
  getDownloadQueue,
  resetDownloadQueue,
  updateDownloadQueue,
  type DownloadQueueSettings,
  type DownloadQueueState,
} from "@/lib/api";
import { getCurrentUser, getSessionToken } from "@/lib/auth";

// The queue decides whether installers can be downloaded at all, so it is
// admin-only: the page hides it from other roles, re-checked here so a
// non-admin session cannot drive the actions directly. The session token is
// forwarded so the API can attribute the change in its log.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return getSessionToken();
}

export type DownloadQueueResult =
  | { ok: true; state: DownloadQueueState }
  | { ok: false; error: string; status?: number };

export type DownloadQueueEvictResult =
  | { ok: true; evicted: number }
  | { ok: false; error: string; status?: number };

function toError(e: unknown, fallback: string): { ok: false; error: string; status?: number } {
  if (e instanceof ApiError) return { ok: false, error: e.message, status: e.status };
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// Same ranges the API enforces; checked here too so a bad value never leaves
// the dashboard.
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 10000;
const RETRY_AFTER_MIN = 1;
const RETRY_AFTER_MAX = 86400;

function isIntIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export async function getDownloadQueueAction(): Promise<DownloadQueueResult> {
  try {
    await requireAdmin();
    return { ok: true, state: await getDownloadQueue() };
  } catch (e) {
    return toError(e, "Failed to read the download queue");
  }
}

export async function updateDownloadQueueAction(
  data: Partial<DownloadQueueSettings>,
): Promise<DownloadQueueResult> {
  try {
    const sessionToken = await requireAdmin();
    const patch: Partial<DownloadQueueSettings> = {};
    if (data.enabled !== undefined) {
      if (typeof data.enabled !== "boolean") return { ok: false, error: "Invalid enabled", status: 400 };
      patch.enabled = data.enabled;
    }
    if (data.capacity !== undefined) {
      if (!isIntIn(data.capacity, CAPACITY_MIN, CAPACITY_MAX)) {
        return { ok: false, error: `capacity must be ${CAPACITY_MIN}-${CAPACITY_MAX}`, status: 400 };
      }
      patch.capacity = data.capacity;
    }
    if (data.retry_after_seconds !== undefined) {
      if (!isIntIn(data.retry_after_seconds, RETRY_AFTER_MIN, RETRY_AFTER_MAX)) {
        return {
          ok: false,
          error: `retry_after_seconds must be ${RETRY_AFTER_MIN}-${RETRY_AFTER_MAX}`,
          status: 400,
        };
      }
      patch.retry_after_seconds = data.retry_after_seconds;
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update", status: 400 };

    return { ok: true, state: await updateDownloadQueue(patch, { sessionToken }) };
  } catch (e) {
    return toError(e, "Failed to update the download queue");
  }
}

export async function resetDownloadQueueAction(): Promise<DownloadQueueResult> {
  try {
    const sessionToken = await requireAdmin();
    return { ok: true, state: await resetDownloadQueue({ sessionToken }) };
  } catch (e) {
    return toError(e, "Failed to reset the download queue");
  }
}

export async function evictDownloadQueueSlotAction(id: number): Promise<DownloadQueueEvictResult> {
  try {
    const sessionToken = await requireAdmin();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Invalid slot", status: 400 };
    const { evicted } = await evictDownloadQueueSlot(id, { sessionToken });
    return { ok: true, evicted };
  } catch (e) {
    return toError(e, "Failed to stop the download");
  }
}

export async function evictAllDownloadQueueSlotsAction(): Promise<DownloadQueueEvictResult> {
  try {
    const sessionToken = await requireAdmin();
    const { evicted } = await evictAllDownloadQueueSlots({ sessionToken });
    return { ok: true, evicted };
  } catch (e) {
    return toError(e, "Failed to stop the downloads");
  }
}
