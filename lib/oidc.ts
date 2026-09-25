import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * OpenID Connect authorization-code flow with PKCE, against Keycloak (or any
 * compliant provider). This server only runs the browser redirect dance; the
 * ID token it ends up with is handed to the API (POST /admin/auth/oidc), which
 * verifies it and opens the session. So nothing here trusts the token.
 *
 * Deliberately hand-rolled rather than a library: it is three requests, and
 * the session stays the API's own opaque one.
 */

export const OIDC_FLOW_COOKIE = "aryx_oidc";
export const OIDC_FLOW_MAX_AGE = 60 * 10;

export type OidcConfig = {
  issuer: string;
  clientId: string;
  /** Empty for a public client (PKCE alone). */
  clientSecret: string;
  /** Public URL of this dashboard, used to build the redirect URIs. */
  publicUrl: string;
};

/** Null when SSO is not configured, which keeps the login page password-only. */
export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim().replace(/\/+$/, "");
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!issuer || !clientId || !publicUrl) return null;
  return {
    issuer,
    clientId,
    clientSecret: process.env.OIDC_CLIENT_SECRET?.trim() ?? "",
    publicUrl,
  };
}

export function redirectUri(cfg: OidcConfig): string {
  return `${cfg.publicUrl}/auth/callback`;
}

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};

let cachedDiscovery: { issuer: string; doc: Discovery; at: number } | undefined;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

async function discover(cfg: OidcConfig): Promise<Discovery> {
  if (
    cachedDiscovery &&
    cachedDiscovery.issuer === cfg.issuer &&
    Date.now() - cachedDiscovery.at < DISCOVERY_TTL_MS
  ) {
    return cachedDiscovery.doc;
  }
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  cachedDiscovery = { issuer: cfg.issuer, doc, at: Date.now() };
  return doc;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** What must survive the round trip to the provider; kept in a short-lived httpOnly cookie. */
export type OidcFlowState = { state: string; nonce: string; verifier: string };

export async function startAuthorization(
  cfg: OidcConfig,
): Promise<{ url: string; flow: OidcFlowState }> {
  const disco = await discover(cfg);
  const flow: OidcFlowState = {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
  };
  const challenge = b64url(createHash("sha256").update(flow.verifier).digest());

  const url = new URL(disco.authorization_endpoint);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", redirectUri(cfg));
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), flow };
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  verifier: string,
): Promise<{ idToken: string }> {
  const disco = await discover(cfg);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(cfg),
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const res = await fetch(disco.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status}`);
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("OIDC token response has no id_token");
  return { idToken: json.id_token };
}

/**
 * Where to send the browser to end the provider's own session too, or null
 * when the provider has no such endpoint. Without this, "sign out" would only
 * drop the dashboard session and the next click on SSO would sign straight
 * back in.
 */
export async function endSessionUrl(cfg: OidcConfig): Promise<string | null> {
  const disco = await discover(cfg).catch(() => null);
  if (!disco?.end_session_endpoint) return null;
  const url = new URL(disco.end_session_endpoint);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("post_logout_redirect_uri", `${cfg.publicUrl}/login`);
  return url.toString();
}
