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
