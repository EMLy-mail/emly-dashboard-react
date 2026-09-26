import type { UserRole } from "@/lib/api";

// owner > admin > user. Owner is only ever granted through the SSO group
// mapping (never creatable from the Users page), and is what unlocks anything
// deliberately kept out of an ordinary admin's sight.

/** Admins and owners: everything an admin can do. */
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

export function isOwnerRole(role: UserRole | null | undefined): boolean {
  return role === "owner";
}

/**
 * Pages still in beta. The one place that decides it: the sidebar hides them
 * from anyone who cannot see beta, each page redirects those users away, and
 * the actions behind them refuse them. Adding a page here is the whole change.
 */
export const BETA_PATHS = ["/remote"] as const;

export function isBetaPath(path: string): boolean {
  return BETA_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Beta pages are for owners only; admins do not see them. */
export function canSeeBeta(role: UserRole | null | undefined): boolean {
  return isOwnerRole(role);
}

type RoleSubject = { id: string; role: UserRole };

/**
 * Whether `actor` may reset the password of, or delete, `target`. Owners can
 * manage anyone. Admins can manage ordinary users and themselves, but not
 * other admins or owners. Everyone else can only touch their own account.
 */
export function canManageUser(actor: RoleSubject | null | undefined, target: RoleSubject): boolean {
  if (!actor) return false;
  if (actor.id === target.id) return true;
  if (actor.role === "owner") return true;
  if (actor.role === "admin") return target.role === "user";
  return false;
}
