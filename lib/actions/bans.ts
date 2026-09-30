"use server";

import { revalidatePath } from "next/cache";
import { createBan, deleteBan, ApiError, type BanType } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";

// Banning decides who can reach the API at all, so it is admin-only - the
// same bar the API puts on the routes themselves, re-checked here so a
// non-admin session cannot drive the action directly.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Unauthorized");
}

export type BanActionState = { error?: string; success?: boolean };

const BAN_TYPES: BanType[] = ["ip", "hwid", "hostname"];

export async function createBanAction(
  _prevState: BanActionState,
  formData: FormData,
): Promise<BanActionState> {
  const banType = formData.get("ban_type") as BanType;
  const value = ((formData.get("value") as string) ?? "").trim();
  const reason = ((formData.get("reason") as string) ?? "").trim();

  try {
    await requireAdmin();
    if (!BAN_TYPES.includes(banType)) return { error: "Invalid ban type" };
    if (!value) return { error: "Value is required" };

    await createBan({ ban_type: banType, value, reason: reason || undefined });
    // Both pages show bans: the list itself, and the client detail page whose
    // buttons reflect whether that machine is already blocked.
    revalidatePath("/bans");
    revalidatePath("/statistics", "layout");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to create ban" };
  }
}

export async function deleteBanAction(id: number) {
  await requireAdmin();
  await deleteBan(id);
  revalidatePath("/bans");
  revalidatePath("/statistics", "layout");
}
