import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, loginOidc } from "@/lib/api";
import { setSessionToken } from "@/lib/auth";
import { exchangeCode, getOidcConfig, OIDC_FLOW_COOKIE, type OidcFlowState } from "@/lib/oidc";

type LoginError = "ssoUnavailable" | "ssoDenied" | "ssoForbidden" | "ssoConflict" | "ssoFailed";

// Where the identity provider sends the browser back to. Every outcome ends in
// a redirect: to the app on success, to /login?error=... otherwise.
export async function GET(request: NextRequest) {
  const cfg = getOidcConfig();
  if (!cfg) redirect("/login");

  const store = await cookies();
  const raw = store.get(OIDC_FLOW_COOKIE)?.value;
  // The flow cookie is single-use whatever happens next.
  store.delete(OIDC_FLOW_COOKIE);

  const params = request.nextUrl.searchParams;
  // The user cancelled, or the provider refused (e.g. not allowed to the client).
  if (params.get("error")) redirect("/login?error=ssoDenied");

  let flow: OidcFlowState | null = null;
  try {
    flow = raw ? (JSON.parse(raw) as OidcFlowState) : null;
  } catch {
    flow = null;
  }
  const code = params.get("code");
  // state ties this callback to the login attempt this browser started (CSRF).
  if (!flow || !code || params.get("state") !== flow.state) redirect("/login?error=ssoFailed");

  let failure: LoginError | null = null;
  try {
    const { idToken } = await exchangeCode(cfg, code, flow.verifier);
    const { session_id } = await loginOidc(idToken, flow.nonce);
    await setSessionToken(session_id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) failure = "ssoForbidden";
    else if (e instanceof ApiError && e.status === 409) failure = "ssoConflict";
    else if (e instanceof ApiError && e.status === 404) failure = "ssoUnavailable";
    else failure = "ssoFailed";
  }
  // redirect() throws, so it stays outside the try/catch.
  if (failure) redirect(`/login?error=${failure}`);
  redirect("/bug-reports");
}
