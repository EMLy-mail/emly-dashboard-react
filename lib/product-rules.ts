// Product validation rules the API enforces (`/v2/products`, ROUTES.md §5.11).
// No `server-only`: the product form checks them before submitting, and the
// actions re-check them before calling the API.

export const PRODUCT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,19}$/;

/** Static segments under /v2/updates (plus the stats filters): 400 as a slug. */
export const RESERVED_PRODUCT_SLUGS: readonly string[] = [
  "manifest",
  "releases",
  "download",
  "updater",
  "all",
  "products",
];

export const PRODUCT_NAME_MAX = 100;

/** Cannot be deleted (the API answers 409): the historical routes serve it. */
export const EMLY_PRODUCT = "emly";

export type ProductSlugProblem = "format" | "reserved";

export function checkProductSlug(slug: string): ProductSlugProblem | null {
  if (!PRODUCT_SLUG_PATTERN.test(slug)) return "format";
  if (RESERVED_PRODUCT_SLUGS.includes(slug)) return "reserved";
  return null;
}

/** Stats filters that are not products: the Agent's self-update, and everything. */
export const STATS_PRODUCT_UPDATER = "updater";
export const STATS_PRODUCT_ALL = "all";
