"use server";

import { redirect } from "next/navigation";
import { login, logoutSession, resetUserPassword, ApiError } from "@/lib/api";
import { endSessionUrl, getOidcConfig } from "@/lib/oidc";
import { setSessionToken, clearSessionToken, getSessionToken, getCurrentUser } from "@/lib/auth";

export type LoginActionState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  let sessionId: string;
  try {
    const result = await login(username, password);
    sessionId = result.session_id;
    await setSessionToken(sessionId);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) return { error: "Invalid credentials" };
      if (e.status === 403) return { error: "Account disabled" };
      return { error: e.message };
    }
    return { error: e instanceof Error ? e.message : "An unexpected error occurred" };
  }

  redirect("/bug-reports");
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  const user = await getCurrentUser();
  if (token) {
    await logoutSession(token).catch(() => {});
  }
  await clearSessionToken();

  // An SSO user also has a session at the identity provider; end it too, or the
  // next "Sign in with SSO" would log straight back in.
  const oidc = user?.auth_provider === "oidc" ? getOidcConfig() : null;
  const providerLogout = oidc ? await endSessionUrl(oidc) : null;
  redirect(providerLogout ?? "/login");
}

// Codes rather than text: the dialog translates them.
export type ChangePasswordActionState = {
  error?: "unauthorized" | "required" | "mismatch" | "unchanged" | "wrongCurrent" | "failed";
  success?: boolean;
};

export async function changeOwnPasswordAction(
  _prevState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  // The user id comes from the session, never from the form: this action can
  // only ever change the caller's own password.
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!currentPassword || !newPassword) return { error: "required" };
  if (newPassword !== confirmPassword) return { error: "mismatch" };
  if (newPassword === currentPassword) return { error: "unchanged" };

  // The API has no self-service route, so the current password is checked
  // through login; the session it opens is dropped straight away.
  try {
    const { session_id } = await login(user.username, currentPassword);
    await logoutSession(session_id).catch(() => {});
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { error: "wrongCurrent" };
    return { error: "failed" };
  }

  try {
    await resetUserPassword(user.id, newPassword);
    return { success: true };
  } catch {
    return { error: "failed" };
  }
}
