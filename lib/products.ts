import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError, getProducts, validateSession, type AuthUser, type Product } from "./api";
import { getCurrentUser, getSessionToken } from "./auth";
import { EMLY_PRODUCT, STATS_PRODUCT_ALL, STATS_PRODUCT_UPDATER } from "./product-rules";

/**
 * The products the user is scoped to, from `validate.user.products`: the list
 * the API filters by, so the one the selector offers. An API that predates
 * products sends no list and serves EMLy alone.
 */
export function userProductSlugs(user: AuthUser | null | undefined): string[] {
  if (!user) return [];
  return user.products ?? [EMLY_PRODUCT];
}

/** Slug and display name, for the selector and page headings. */
export interface ProductOption {
  slug: string;
  name: string;
  /** false = hidden from the public manifest and downloads. Unknown counts as enabled. */
  enabled: boolean;
}

/**
 * The user's products with their readable names. Names come from the scoped
 * `GET /v2/products`; a slug missing there (API hiccup, older API) falls back
 * to showing the slug itself rather than dropping the product.
 */
export const getUserProductOptions = cache(async (): Promise<ProductOption[]> => {
  const user = await getCurrentUser();
  const slugs = userProductSlugs(user);
  if (slugs.length === 0) return [];
  const registry = await getProducts().catch((): Product[] => []);
  const bySlug = new Map(registry.map((p) => [p.slug, p]));
  return slugs.map((slug) => ({
    slug,
    name: bySlug.get(slug)?.name ?? slug,
    enabled: bySlug.get(slug)?.enabled ?? true,
  }));
});

/**
 * The product the updates page opens on when no tab is asked for: EMLy, else
 * the user's first product. Null for a user with no products.
 */
export const getDefaultProduct = cache(async (): Promise<string | null> => {
  const slugs = userProductSlugs(await getCurrentUser());
  if (slugs.length === 0) return null;
  return slugs.includes(EMLY_PRODUCT) ? EMLY_PRODUCT : slugs[0];
});

/** Whether `slug` is one of the signed-in user's products. */
export async function userHasProduct(slug: string): Promise<boolean> {
  return userProductSlugs(await getCurrentUser()).includes(slug);
}

/** Values the stats `?product=` filter accepts for this user. */
export function statsProductFilters(user: AuthUser | null | undefined): string[] {
  return [...userProductSlugs(user), STATS_PRODUCT_UPDATER, STATS_PRODUCT_ALL];
}

/**
 * Default stats filter, as the API picks it for the stream: EMLy, or `all`
 * (the user's own products) when the user does not have EMLy.
 */
export function defaultStatsProduct(user: AuthUser | null | undefined): string {
  return userProductSlugs(user).includes(EMLY_PRODUCT) ? EMLY_PRODUCT : STATS_PRODUCT_ALL;
}

/**
 * A scoped route answered 403 ("product not assigned to this user"). That is
 * also what an expired or revoked session gets now, instead of the old
 * "see everything": when the session no longer validates, send the user to
 * log in again; otherwise let the caller report the 403.
 */
export async function redirectIfSessionExpired(e: unknown): Promise<void> {
  if (!(e instanceof ApiError) || e.status !== 403) return;
  const token = await getSessionToken();
  if (!token) redirect("/login");
  try {
    await validateSession(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/login");
  }
}
