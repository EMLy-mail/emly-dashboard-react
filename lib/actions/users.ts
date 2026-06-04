"use server";

import { revalidatePath } from "next/cache";
import { createUser, updateUser, deleteUser, resetUserPassword, ApiError, type UserRole } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
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
  await requireAdmin();
  await updateUser(id, data);
  revalidatePath("/users");
}

export async function deleteUserAction(id: string) {
  await requireAdmin();
  await deleteUser(id);
  revalidatePath("/users");
}

export async function resetPasswordAction(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const id = formData.get("userId") as string;
  const password = formData.get("password") as string;

  try {
    await requireAdmin();
    await resetUserPassword(id, password);
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to reset password" };
  }
}
