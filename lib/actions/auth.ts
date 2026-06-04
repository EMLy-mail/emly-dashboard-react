"use server";

import { redirect } from "next/navigation";
import { login, logoutSession, ApiError } from "@/lib/api";
import { setSessionToken, clearSessionToken, getSessionToken } from "@/lib/auth";

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
  if (token) {
    await logoutSession(token).catch(() => {});
  }
  await clearSessionToken();
  redirect("/login");
}
