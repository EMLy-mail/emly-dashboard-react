import type { NextRequest } from "next/server";
import { backchannelLogoutOidc } from "@/lib/api";

// OpenID Connect Back-Channel Logout: when a user signs out at the identity
// provider (Keycloak), it POSTs a signed logout_token here, server to server.
// The token is verified by the API, which drops that user's sessions, so
// signing out of Keycloak signs them out of this console too.
//
// Public on purpose (the provider has no session or keys for us): the token's
// signature is the authentication, and the API is what checks it.
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };

  const form = await request.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string" || !logoutToken) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }

  try {
    await backchannelLogoutOidc(logoutToken);
    return new Response(null, { status: 200, headers });
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
}
