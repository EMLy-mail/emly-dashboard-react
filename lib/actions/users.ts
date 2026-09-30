"use server";

import { revalidatePath } from "next/cache";
import {
  createUser,
  updateUser,
  deleteUser,
  getUsers,
  getUserProducts,
  resetUserPassword,
  setUserProducts,
  ApiError,
  type UserRole,
} from "@/lib/api";
import { getCurrentUser, getSessionToken } from "@/lib/auth";
import { redirectIfSessionExpired, userProductSlugs } from "@/lib/products";
import { canAssignProducts, canManageUser, isAdminRole } from "@/lib/roles";

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
  return actor;
}

export type UserActionState = { error?: string; success?: boolean };

// A product assignment is replaced as a whole by the API. The acting admin
// only sees (and so only offers) their own products, so the target's other
// products are carried over untouched rather than silently dropped.
async function assignProducts(targetId: string, picked: string[]) {
  const actor = await getCurrentUser();
  if (!actor || !canAssignProducts(actor.role)) throw new Error("Unauthorized");
  const offered = userProductSlugs(actor);
  const current = (await getUserProducts(targetId)).products ?? [];
  const kept = current.filter((slug) => !offered.includes(slug));
  const chosen = picked.filter((slug) => offered.includes(slug));
  return setUserProducts(targetId, [...new Set([...chosen, ...kept])], await getSessionToken());
}

export type CreateUserActionState = UserActionState & {
  /** The user was created, but assigning the picked products failed. */
  productsError?: string;
};

export async function createUserAction(
  _prevState: CreateUserActionState,
  formData: FormData,
): Promise<CreateUserActionState> {
  const username = formData.get("username") as string;
  const displayname = formData.get("displayname") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as UserRole;
  const products = formData.getAll("products").map(String);

  let created;
  try {
    await requireAdmin();
    created = await createUser({ username, displayname: displayname || undefined, password, role });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to create user" };
  }

  // A new user has no products and sees nothing until given some.
  if (products.length > 0) {
    try {
      await assignProducts(created.id, products);
    } catch (e) {
      revalidatePath("/users");
      return { success: true, productsError: e instanceof Error ? e.message : "Failed to assign products" };
    }
  }
  revalidatePath("/users");
  return { success: true };
}

export async function setUserProductsAction(
  id: string,
  products: string[],
): Promise<{ error?: string; products?: string[] }> {
  try {
    const result = await assignProducts(id, products);
    revalidatePath("/users");
    return { products: result.products };
  } catch (e) {
    await redirectIfSessionExpired(e);
    if (e instanceof Error) return { error: e.message };
    return { error: "Failed to assign products" };
  }
}

export async function updateUserAction(id: string, data: { displayname?: string; enabled?: boolean }) {
  const actor = await requireCanManage(id);
  if (data.enabled === false && actor.id === id) throw new Error("Cannot disable your own account");
  await updateUser(id, data, await getSessionToken());
  revalidatePath("/users");
}

export async function deleteUserAction(id: string) {
  const actor = await requireCanManage(id);
  if (actor.id === id) throw new Error("Cannot delete your own account");
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
