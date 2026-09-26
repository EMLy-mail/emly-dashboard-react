"use server";

import { revalidatePath } from "next/cache";
import { createUser, updateUser, deleteUser, getUsers, resetUserPassword, ApiError, type UserRole } from "@/lib/api";
import { getCurrentUser, getSessionToken } from "@/lib/auth";
import { canManageUser, isAdminRole } from "@/lib/roles";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Unauthorized");
  return user;
}

// The API authenticates these calls with the admin key, so it cannot tell who
// is acting: the rule "an admin cannot touch another admin" lives here, checked
// against the target's role as the API has it, not as the client claims. The
// API re-applies the same rule when given the session token (defense in depth).
async function requireCanManage(targetId: string) {
  const actor = await requireAdmin();
  const target = (await getUsers()).find((u) => u.id === targetId);
  if (!target) throw new Error("User not found");
  if (!canManageUser(actor, target)) throw new Error("Unauthorized");
}

export type UserActionState = { error?: string; success?: boolean };

export async function createUserAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const username = formData.get("username") as string;
  const displayname = formData.get("displayname") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as UserRole;

  try {
    await createUser({ username, displayname: displayname || undefined, password, role });
    revalidatePath("/users");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to create user" };
  }
}

export async function updateUserAction(id: string, data: { displayname?: string; enabled?: boolean }) {
  await requireCanManage(id);
  await updateUser(id, data, await getSessionToken());
  revalidatePath("/users");
}

export async function deleteUserAction(id: string) {
  await requireCanManage(id);
  await deleteUser(id, await getSessionToken());
  revalidatePath("/users");
}

export async function resetPasswordAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const id = formData.get("userId") as string;
  const password = formData.get("password") as string;

  try {
    await requireCanManage(id);
    await resetUserPassword(id, password, await getSessionToken());
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to reset password" };
  }
}
