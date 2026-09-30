"use server";

import { revalidatePath } from "next/cache";
import { ApiError, deleteStatsClient } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";

// Deleting a client throws away its whole event history, so it is admin-only:
// the same bar the API sets on the route, re-checked here so a non-admin
// session cannot drive the action directly.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Unauthorized");
}

export type DeleteStatsClientState = { error?: string; eventsDeleted?: number };

export async function deleteStatsClientAction(id: number): Promise<DeleteStatsClientState> {
  try {
    await requireAdmin();
    const result = await deleteStatsClient(id);
    // Every page that lists clients or counts them.
    revalidatePath("/statistics", "layout");
    revalidatePath("/clients");
    revalidatePath("/");
    return { eventsDeleted: result.events_deleted };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Failed to delete client" };
  }
}
