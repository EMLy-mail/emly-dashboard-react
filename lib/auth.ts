import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { validateSession, type AuthUser } from "./api";

export const SESSION_COOKIE = "emly_session";

async function shouldUseSecureCookie(): Promise<boolean> {
  const hdrs = await headers();
  const forwardedProto = hdrs.get("x-forwarded-proto");
  if (!forwardedProto) return false;

  return forwardedProto
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .includes("https");
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Memoized per-request — layout e pagine chiamano l'API una volta sola
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const { user } = await validateSession(token);
    return user;
  } catch {
    return null;
  }
});
