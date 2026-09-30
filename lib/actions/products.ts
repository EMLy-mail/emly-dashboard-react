"use server";

import { revalidatePath } from "next/cache";
import { ApiError, createProduct, deleteProduct, updateProduct } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirectIfSessionExpired } from "@/lib/products";
import { checkProductSlug, PRODUCT_NAME_MAX } from "@/lib/product-rules";
import { isAdminRole } from "@/lib/roles";

// Codes the product dialog translates; anything else is the API's own text.
export type ProductFormError = "slugFormat" | "slugReserved" | "nameRequired" | "nameTooLong";

export type ProductActionState = {
  error?: string;
  errorCode?: ProductFormError;
  success?: boolean;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) throw new Error("Unauthorized");
}

function checkName(name: string): ProductFormError | null {
  if (!name) return "nameRequired";
  if (name.length > PRODUCT_NAME_MAX) return "nameTooLong";
  return null;
}

async function productError(e: unknown, fallback: string): Promise<ProductActionState> {
  await redirectIfSessionExpired(e);
  if (e instanceof ApiError) return { error: e.message };
  if (e instanceof Error) return { error: e.message };
  return { error: fallback };
}

function revalidateProducts() {
  // The selector in the layout lists products on every page.
  revalidatePath("/", "layout");
}

export async function createProductAction(
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const slug = ((formData.get("slug") as string) ?? "").trim();
  const name = ((formData.get("name") as string) ?? "").trim();
  const s3Prefix = ((formData.get("s3_prefix") as string) ?? "").trim();
  const enabled = formData.get("enabled") === "true";

  const slugProblem = checkProductSlug(slug);
  if (slugProblem) return { errorCode: slugProblem === "format" ? "slugFormat" : "slugReserved" };
  const nameProblem = checkName(name);
  if (nameProblem) return { errorCode: nameProblem };

  try {
    await requireAdmin();
    // The API assigns the new product to its creator (the session's user).
    await createProduct({ slug, name, s3_prefix: s3Prefix || null, enabled });
    revalidateProducts();
    return { success: true };
  } catch (e) {
    return productError(e, "Failed to create product");
  }
}

export async function updateProductAction(
  slug: string,
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const name = ((formData.get("name") as string) ?? "").trim();
  // Sent even when empty: an empty prefix is how the API goes back to the default.
  const s3Prefix = ((formData.get("s3_prefix") as string) ?? "").trim();
  const enabled = formData.get("enabled") === "true";

  const nameProblem = checkName(name);
  if (nameProblem) return { errorCode: nameProblem };

  try {
    await requireAdmin();
    await updateProduct(slug, { name, s3_prefix: s3Prefix, enabled });
    revalidateProducts();
    return { success: true };
  } catch (e) {
    return productError(e, "Failed to update product");
  }
}

/** 409 from the API while the product has releases, and always for `emly`. */
export async function deleteProductAction(slug: string): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    await deleteProduct(slug);
    revalidateProducts();
    return {};
  } catch (e) {
    return productError(e, "Failed to delete product");
  }
}
