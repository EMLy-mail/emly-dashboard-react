import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getOidcConfig,
  startAuthorization,
  OIDC_FLOW_COOKIE,
  OIDC_FLOW_MAX_AGE,
} from "@/lib/oidc";

// Starts the SSO flow: remember state/nonce/PKCE verifier, then send the
// browser to the identity provider.
export async function GET() {
  const cfg = getOidcConfig();
  if (!cfg) redirect("/login");

  let target: string;
  try {
    const { url, flow } = await startAuthorization(cfg);
    const store = await cookies();
    store.set(OIDC_FLOW_COOKIE, JSON.stringify(flow), {
      httpOnly: true,
      secure: cfg.publicUrl.startsWith("https://"),
      // Lax so the cookie comes back on the provider's redirect to /auth/callback.
      sameSite: "lax",
      path: "/",
      maxAge: OIDC_FLOW_MAX_AGE,
    });
    target = url;
  } catch {
    redirect("/login?error=ssoUnavailable");
  }
  redirect(target);
}
