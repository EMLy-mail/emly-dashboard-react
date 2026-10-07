import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { env, SERVER_USER_AGENT } from "./env";
import { SESSION_COOKIE } from "./session-cookie";

// ── Types ──────────────────────────────────────────────────────────────────

export type BugReportStatus = "new" | "in_review" | "resolved" | "closed";
export type UserRole = "owner" | "admin" | "user";

// "oidc" accounts come from single sign-on: no password to change or reset.
export type AuthProvider = "local" | "oidc";

export interface BugReport {
  id: number;
  name: string;
  email: string;
  description: string;
  hwid: string;
  hostname: string;
  os_user: string;
  submitter_ip: string;
  system_info: Record<string, unknown> | null;
  status: BugReportStatus;
  created_at: string;
  updated_at: string;
}

export interface BugReportListItem extends BugReport {
  file_count: number;
}

export interface BugReportFile {
  id: number;
  report_id: number;
  file_role: "screenshot" | "mail_file" | "localstorage" | "config";
  filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface PaginatedBugReports {
  data: BugReportListItem[] | null;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface User {
  id: string;
  username: string;
  displayname: string;
  role: UserRole;
  enabled: boolean;
  auth_provider: AuthProvider;
  created_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayname: string;
  role: UserRole;
  enabled: boolean;
  auth_provider: AuthProvider;
  /**
   * Product slugs assigned to the user: the same list the API scopes every
   * request by, so it is what the product selector offers. Absent only on an
   * API that predates products; see `userProductSlugs` in lib/products.ts.
   */
  products?: string[];
}

// ── Error ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Present on a 422 from the remote-config validate/preview/publish routes. */
    public problems?: RemoteConfigProblem[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Base fetch ─────────────────────────────────────────────────────────────

type ApiOptions = {
  /**
   * Sent as X-Session-Token. The API scopes releases, products and stats by
   * the user behind it, and without one the admin key sees everything, so
   * left undefined it defaults to the signed-in user's token from the request
   * cookie. Pass null for the calls that must go out without one (login).
   */
  sessionToken?: string | null;
  requiresAdmin?: boolean;
  requiresApi?: boolean;
  baseUrl?: string;
};

async function requestSessionToken(): Promise<string | undefined> {
  try {
    return (await cookies()).get(SESSION_COOKIE)?.value;
  } catch (e) {
    // Outside a request (no cookies to read) there is no user to act for.
    unstable_rethrow(e);
    return undefined;
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: ApiOptions = {},
): Promise<T> {
  const sessionToken =
    opts.sessionToken === undefined ? await requestSessionToken() : opts.sessionToken;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    "User-Agent": SERVER_USER_AGENT,
  };

  if (opts.requiresApi !== false) {
    headers["X-API-Key"] = env.apiKey;
  }
  if (opts.requiresAdmin) {
    headers["X-Admin-Key"] = env.adminKey;
  }
  if (sessionToken) {
    headers["X-Session-Token"] = sessionToken;
  }
  if (env.dashboardKey) {
    headers["X-Dashboard-Key"] = env.dashboardKey;
  }
  if (!headers["Content-Type"] && init.method !== "PATCH" && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const base = opts.baseUrl ?? (env.apiBaseUrl + "/v2/api");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Unknown error", body.problems);
  }

  return res.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  return apiFetch<{ session_id: string; user: AuthUser }>(
    "/admin/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    { requiresApi: false, sessionToken: null },
  );
}

/**
 * Exchanges the ID token the identity provider issued for an API session. The
 * API verifies the token itself; the nonce proves it was minted for this login.
 */
export async function loginOidc(idToken: string, nonce: string) {
  return apiFetch<{ session_id: string; user: AuthUser }>(
    "/admin/auth/oidc",
    { method: "POST", body: JSON.stringify({ id_token: idToken, nonce }) },
    { requiresApi: false, requiresAdmin: true, sessionToken: null },
  );
}

/** Hands the provider's back-channel logout token to the API, which verifies it and drops that user's sessions. */
export async function backchannelLogoutOidc(logoutToken: string) {
  return apiFetch<{ sessions_removed: number }>(
    "/admin/auth/oidc/backchannel-logout",
    { method: "POST", body: JSON.stringify({ logout_token: logoutToken }) },
    { requiresApi: false, requiresAdmin: true, sessionToken: null },
  );
}

export async function validateSession(token: string) {
  return apiFetch<{ success: boolean; user: AuthUser }>(
    "/admin/auth/validate",
    {},
    { sessionToken: token, requiresApi: false },
  );
}

export async function logoutSession(token: string) {
  return apiFetch<{ logged_out: boolean }>(
    "/admin/auth/logout",
    { method: "POST" },
    { sessionToken: token, requiresApi: false },
  );
}

// ── Bug Reports ────────────────────────────────────────────────────────────

export async function getBugReports(opts: {
  page?: number;
  page_size?: number;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.search) params.set("search", opts.search);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<PaginatedBugReports>(`/bug-report${qs}`, {}, { requiresApi: true, requiresAdmin: true });
}

export async function getBugReportCount(status?: BugReportStatus) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<{ count: number }>(`/bug-report/count${qs}`, {}, { requiresApi: true });
}

export async function getBugReport(id: number) {
  return apiFetch<{ report: BugReport }>(
    `/bug-report/${id}`,
    {},
    { requiresApi: true, requiresAdmin: true },
  );
}

export async function deleteBugReport(id: number) {
  return apiFetch<{ message: string }>(
    `/bug-report/${id}`,
    { method: "DELETE" },
    { requiresApi: true, requiresAdmin: true },
  );
}

export async function updateBugReportStatus(id: number, status: BugReportStatus) {
  return apiFetch<{ message: string }>(
    `/bug-report/${id}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "text/plain" },
      body: status,
    },
    { requiresApi: true, requiresAdmin: true },
  );
}

export async function getBugReportFiles(id: number) {
  return apiFetch<BugReportFile[]>(
    `/bug-report/${id}/files`,
    {},
    { requiresApi: true, requiresAdmin: true },
  );
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUsers() {
  return apiFetch<User[]>("/admin/users", {}, { requiresAdmin: true, requiresApi: false });
}

export async function createUser(data: {
  username: string;
  displayname?: string;
  password: string;
  role: UserRole;
}) {
  return apiFetch<User>(
    "/admin/users",
    { method: "POST", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false },
  );
}

// The three calls below act on an account. Passing the acting user's session
// token lets the API enforce the role rules itself (an admin cannot touch
// another admin); without it the call is treated as admin-key automation.
export async function updateUser(
  id: string,
  data: { displayname?: string; enabled?: boolean },
  sessionToken?: string,
) {
  return apiFetch<{ updated: boolean }>(
    `/admin/users/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false, sessionToken },
  );
}

export async function deleteUser(id: string, sessionToken?: string) {
  return apiFetch<{ deleted: boolean }>(
    `/admin/users/${id}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, sessionToken },
  );
}

export async function resetUserPassword(id: string, password: string, sessionToken?: string) {
  return apiFetch<{ updated: boolean }>(
    `/admin/users/${id}/reset-password`,
    { method: "POST", body: JSON.stringify({ password }) },
    { requiresAdmin: true, requiresApi: false, sessionToken },
  );
}

/** The product slugs a user is scoped to. */
export async function getUserProducts(id: string) {
  return apiFetch<{ user_id: string; products: string[] }>(
    `/admin/users/${id}/products`,
    {},
    { requiresAdmin: true, requiresApi: false },
  );
}

/**
 * Replaces the user's whole assignment (`[]` removes every product). With a
 * session, the API lets only an `admin`-role user call it (403 otherwise). The
 * user sees the change on their next request; their product selector follows
 * on the next `validate`.
 */
export async function setUserProducts(id: string, products: string[], sessionToken?: string) {
  return apiFetch<{ user_id: string; products: string[] }>(
    `/admin/users/${id}/products`,
    { method: "PUT", body: JSON.stringify({ products }) },
    { requiresAdmin: true, requiresApi: false, sessionToken },
  );
}

// ── Products ───────────────────────────────────────────────────────────────
// The registry of products distributed from /v2/updates/{product}. With a
// session every call is scoped: the list holds only the user's products, and
// one outside the scope is 404.

export interface Product {
  /** Permanent: written into every release, event and inventory row. */
  slug: string;
  name: string;
  /** Absent = derived (`<S3_UPDATES_PREFIX>/<slug>`, `emly` at the root). */
  s3_prefix?: string | null;
  /** false = 404 on the public manifest and downloads; releases stay manageable. */
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

function productsBase(): string {
  return env.apiBaseUrl + "/v2/products";
}

export async function getProducts() {
  return apiFetch<Product[]>("", {}, { requiresAdmin: true, requiresApi: false, baseUrl: productsBase() });
}

/** 409 when the slug already exists. The creator is assigned the product. */
export async function createProduct(data: {
  slug: string;
  name: string;
  s3_prefix?: string | null;
  enabled?: boolean;
}) {
  return apiFetch<Product>(
    "",
    { method: "POST", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false, baseUrl: productsBase() },
  );
}

/** An empty `s3_prefix` goes back to the default. Changing it moves no file. */
export async function updateProduct(
  slug: string,
  data: { name?: string; s3_prefix?: string; enabled?: boolean },
) {
  return apiFetch<Product>(
    `/${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    { requiresAdmin: true, requiresApi: false, baseUrl: productsBase() },
  );
}

/** 409 while the product still has releases, and always for `emly`. */
export async function deleteProduct(slug: string) {
  return apiFetch<{ deleted: boolean }>(
    `/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: productsBase() },
  );
}

// ── Updates ────────────────────────────────────────────────────────────────

/**
 * Filter value for `GET /updates/releases?channel=`. Not used to set channel
 * membership on a release — that's done via `Release.is_stable`/`is_beta`,
 * which are independent (a release can be both at once).
 */
export type ReleaseChannel = "stable" | "beta" | "archived";
export type ReleaseSeverity = "none" | "security" | "bugfix" | "feature";

export interface DetailedNote {
  severityType: ReleaseSeverity;
  description: Record<string, string>;
}

export interface UpdateManifest {
  stableVersion: string;
  betaVersion?: string;
  stableDownload: string;
  betaDownload?: string;
  isCritical: boolean;
  criticalVersion?: string;
  minRequiredVersion?: string;
  sha256Checksums: Record<string, string>;
  releaseNotes: Record<string, string>;
  detailedReleaseNotes?: Record<string, DetailedNote>;
}

export interface Release {
  /** Slug of the product the release belongs to; versions are unique per product. */
  product: string;
  version: string;
  is_stable: boolean;
  is_beta: boolean;
  download_filename: string;
  sha256_checksum: string;
  short_note: string;
  severity_type: ReleaseSeverity;
  description_en: string | null;
  description_it: string | null;
  is_critical: boolean;
  critical_version: string | null;
  min_required_version: string | null;
  released_at: string;
  created_at: string;
}

function updatesBase(): string {
  return env.apiBaseUrl + "/v2";
}

/**
 * Path of a product's release routes. Every product, EMLy included, goes
 * through `/updates/{product}/...`; the unprefixed routes are EMLy-only
 * aliases kept for the clients in the field.
 */
function releasesPath(product: string, version?: string): string {
  const base = `/updates/${encodeURIComponent(product)}/releases`;
  return version === undefined ? base : `${base}/${encodeURIComponent(version)}`;
}

/** Public manifest path of a product, relative to the API root. */
export function productManifestPath(product: string): string {
  return `/v2/updates/${encodeURIComponent(product)}/manifest`;
}

/** Public: 404 when the product does not exist or is disabled. */
export async function getUpdateManifest(product: string) {
  return apiFetch<UpdateManifest>(
    `/updates/${encodeURIComponent(product)}/manifest`,
    {},
    { requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function getReleases(product: string, channel?: ReleaseChannel) {
  const qs = channel ? `?channel=${channel}` : "";
  return apiFetch<Release[]>(
    `${releasesPath(product)}${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function createRelease(product: string, data: {
  file: File;
  version: string;
  short_note?: string;
  is_stable?: boolean;
  is_beta?: boolean;
  severity_type?: ReleaseSeverity;
  description_en?: string | null;
  description_it?: string | null;
  is_critical?: boolean;
  critical_version?: string | null;
  min_required_version?: string | null;
}) {
  const form = new FormData();
  form.append("file", data.file);
  form.append("version", data.version);
  form.append("is_stable", data.is_stable ? "true" : "false");
  form.append("is_beta", data.is_beta ? "true" : "false");
  if (data.short_note) form.append("short_note", data.short_note);
  if (data.severity_type) form.append("severity_type", data.severity_type);
  if (data.description_en) form.append("description_en", data.description_en);
  if (data.description_it) form.append("description_it", data.description_it);
  form.append("is_critical", data.is_critical ? "true" : "false");
  if (data.critical_version) form.append("critical_version", data.critical_version);
  if (data.min_required_version) form.append("min_required_version", data.min_required_version);

  return apiFetch<{ version: string; is_stable: boolean; is_beta: boolean; download_filename: string; sha256_checksum: string }>(
    releasesPath(product),
    { method: "POST", body: form },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function deleteRelease(product: string, version: string) {
  return apiFetch<{ deleted: boolean }>(
    releasesPath(product, version),
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function updateRelease(
  product: string,
  version: string,
  data: {
    short_note?: string;
    is_stable?: boolean;
    is_beta?: boolean;
    severity_type?: ReleaseSeverity;
    description_en?: string | null;
    description_it?: string | null;
    is_critical?: boolean;
    critical_version?: string | null;
    min_required_version?: string | null;
  },
) {
  return apiFetch<Release>(
    releasesPath(product, version),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

/**
 * Sets is_stable and/or is_beta on a release. Setting either to true demotes
 * whoever currently holds that slot in the same product; the two flags are
 * independent, so a release may hold both at once. Setting a flag to false
 * just clears it.
 */
export async function setReleaseChannels(
  product: string,
  version: string,
  flags: { is_stable?: boolean; is_beta?: boolean },
) {
  return apiFetch<{ version: string; is_stable: boolean; is_beta: boolean }>(
    `${releasesPath(product, version)}/channel`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flags),
    },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

// ── Updater self-update ────────────────────────────────────────────────────

/**
 * Self-update contract for the AryxD Agent. Deliberately poorer than
 * `UpdateManifest`: no channels, no criticality, no downgrade. An empty (or
 * absent) `version` means "nothing to distribute" — the kill-switch state.
 */
export interface UpdaterManifest {
  version: string;
  download?: string;
  sha256?: string;
  size?: number;
  publishedAt?: string;
  releaseNotes?: Record<string, string>;
}

export interface UpdaterRelease {
  version: string;
  /** At most one release holds this — promoting one demotes the other. */
  is_current: boolean;
  download_filename: string;
  sha256_checksum: string;
  file_size: number;
  notes_it: string | null;
  notes_en: string | null;
  published_at: string;
  created_at: string;
}

export async function getUpdaterManifest() {
  return apiFetch<UpdaterManifest>(
    "/updates/manifest/updater",
    {},
    { requiresApi: true, baseUrl: updatesBase() },
  );
}

export async function getUpdaterReleases() {
  return apiFetch<UpdaterRelease[]>(
    "/updates/updater/releases",
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function createUpdaterRelease(data: {
  file: File;
  version: string;
  is_current?: boolean;
  notes_it?: string | null;
  notes_en?: string | null;
  published_at?: string | null;
}) {
  const form = new FormData();
  form.append("file", data.file);
  form.append("version", data.version);
  form.append("is_current", data.is_current ? "true" : "false");
  if (data.notes_it) form.append("notes_it", data.notes_it);
  if (data.notes_en) form.append("notes_en", data.notes_en);
  if (data.published_at) form.append("published_at", data.published_at);

  return apiFetch<{
    version: string;
    is_current: boolean;
    download_filename: string;
    sha256_checksum: string;
    file_size: number;
  }>(
    "/updates/updater/releases",
    { method: "POST", body: form },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

/**
 * Partial update — only the keys present in `data` are changed. An empty
 * string clears a note. `{ is_current: false }` on the served build is the
 * kill-switch: the manifest immediately reverts to `{"version": ""}`.
 */
export async function updateUpdaterRelease(
  version: string,
  data: {
    is_current?: boolean;
    notes_it?: string;
    notes_en?: string;
    published_at?: string;
  },
) {
  return apiFetch<UpdaterRelease>(
    `/updates/updater/releases/${encodeURIComponent(version)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function deleteUpdaterRelease(version: string) {
  return apiFetch<{ deleted: boolean }>(
    `/updates/updater/releases/${encodeURIComponent(version)}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

// ── Stats ──────────────────────────────────────────────────────────────────

export type UpdaterEventType = "manifest_check" | "download";
export type StatsEventBucket = "day" | "hour";

export interface UpdaterClient {
  id: number;
  hostname: string;
  ad_domain: string;
  updater_version?: string | null;
  contact?: string | null;
  last_ip?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  hwid?: string | null;
  /**
   * Interactive user seen on the machine - console or RDP alike - at the last
   * sighting that reported one, as `DOMAIN\user`. It is a snapshot, not a
   * history, so always read it next to `last_seen_at`. The API overwrites it
   * on every request carrying X-EMLy-LoggedUser and clears it when an updater
   * 1.6.2+ reports nobody logged on. Older updaters never clear it, so their
   * rows can still show a user who has since signed out. Null for a client
   * that has never reported one, or one with nobody logged on.
   */
  logged_user?: string | null;
  /**
   * How `logged_user` was attached at that sighting: at the console, over an
   * attached RDP client, or `disconnected` - still logged on with programs
   * running but no client attached (an RDP window closed without signing
   * out). Null for an updater too old to report it.
   */
  logged_user_state?: "active-console" | "active-rdp" | "disconnected" | null;
  /** When a `disconnected` session lost its client; null for any other state. */
  logged_user_disconnected_at?: string | null;
  /** Chassis serial number from the BIOS. */
  serial?: string | null;
  /** Vendor product/SKU number - on HP the `8XXXXXXX#ABZ` on the chassis label. */
  product?: string | null;
  /**
   * The Windows release the machine runs, as one human-readable string the
   * updater renders from the registry: `Windows 11 24H2 Professional (Build
   * 26100.4652)`. Opaque - never parse it, its shape is the updater's to
   * change. Null for a client too old to report it.
   */
  os_version?: string | null;
  /**
   * The EMLy release installed on the machine, read from EMLy's own
   * `config.ini` on every check-in. Null when EMLy is not installed, or when
   * the updater is too old to report it - the two are indistinguishable here.
   * This is not `updater_version`: the updater self-updates on its own
   * schedule, so one current updater version spans several EMLy releases.
   */
  emly_version?: string | null;
  /**
   * Installed-products inventory, the same rows `GET /clients/{id}` returns,
   * sorted by product. Every installed product, not only the user's. Absent
   * on an API that predates it.
   */
  products?: ClientProduct[];
  /** Revision of the remote config document this client last pulled. */
  config_revision?: number | null;
  /** When that pull happened - null for a client that has never fetched config. */
  config_fetched_at?: string | null;
  /**
   * Live presence from the API's in-memory hub (`internal/presencehub`): true
   * exactly while this client holds an open `GET /v2/client/ws` connection.
   * Always present in the API's JSON (`json:"online"`, no `omitempty`), so
   * this is never undefined for a response from an upgraded API - but it is
   * still `false`, not "unknown", for a client that has never opened the
   * channel: an updater built before this field existed, or one whose site
   * hasn't turned `clientWs.enabled` on. `lib/device-status.ts`'s
   * `presenceState` is what turns this bit and `last_seen_at` into the
   * three-state signal the UI shows - never read this field alone to decide
   * whether a machine is reachable.
   */
  online: boolean;
  /**
   * The client's manifest_check events over the API's recent window (50
   * minutes): how many, and the first and last. One poll can log several
   * checks (one per product), so read the first-to-last span, not only the
   * count. Absent on an API that predates it.
   */
  recent_manifest_checks?: {
    window_minutes: number;
    count: number;
    first_at?: string;
    last_at?: string;
  };
}

// ── Bans ───────────────────────────────────────────────────────────────────

/** Which identifier a ban matches on. The three are independent. */
export type BanType = "ip" | "hwid" | "hostname";

export interface Ban {
  id: number;
  ban_type: BanType;
  value: string;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export async function getBans() {
  return apiFetch<Ban[]>(
    "/bans/",
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

/**
 * Creates a ban, or returns the existing one when that identifier is already
 * banned - the API treats a repeat as the state the caller asked for rather
 * than a conflict, so this never needs a "does it exist" round trip.
 */
export async function createBan(input: { ban_type: BanType; value: string; reason?: string }) {
  return apiFetch<Ban>(
    "/bans/",
    { method: "POST", body: JSON.stringify(input) },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function deleteBan(id: number) {
  return apiFetch<{ status: string }>(
    `/bans/${id}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export interface UpdaterEvent {
  id: number;
  client_id: number;
  event_type: UpdaterEventType;
  /**
   * Which manifest the check was against - "updater" for the updater's own
   * self-update feed, "emly" for the app's. Note `version` is the *updater's*
   * version in both cases: the updater polls the app manifest on the app's
   * behalf and stamps the event with its own build, so an "emly" event does
   * not tell you which EMLy App build is actually installed.
   */
  product?: string | null;
  version?: string | null;
  ip_address?: string | null;
  created_at: string;
}

/**
 * `?product=` on the stats routes: a registry slug, `updater` (the Agent's own
 * self-update, which belongs to no product) or `all`. With a session, `all`
 * means the user's products plus `updater`, and an unassigned slug is 403.
 */
export type StatsProductFilter = string;

export interface StatsSummary {
  /** The filter the payload was built for. */
  product?: StatsProductFilter;
  total_clients: number;
  connected_clients: number;
  window_minutes: number;
  events_last_24h: { event_type: string; count: number }[];
  clients_by_version: { updater_version: string | null; count: number }[];
}

export interface PaginatedStatsClients {
  data: UpdaterClient[] | null;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** One product installed on a machine, from its last reported inventory. */
export interface ClientProduct {
  product: string;
  version: string;
  /** Since when the machine has been on this version. */
  updated_at: string;
}

export interface StatsClientDetail {
  client: UpdaterClient;
  events: UpdaterEvent[];
  /** Absent on an API that predates products. */
  products?: ClientProduct[];
}

export interface StatsEventsResponse {
  bucket: StatsEventBucket;
  from: string;
  to: string;
  /** null, not [], when the window has no events (a nil slice on the API side). */
  data: { bucket: string; event_type: string; count: number }[] | null;
}

export async function getStatsSummary(opts: { product?: StatsProductFilter; windowMinutes?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.windowMinutes) params.set("window_minutes", String(opts.windowMinutes));
  if (opts.product) params.set("product", opts.product);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<StatsSummary>(
    `/stats/summary${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function getStatsClients(opts: {
  page?: number;
  page_size?: number;
  online?: boolean;
  window_minutes?: number;
}) {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.online) params.set("online", "true");
  if (opts.window_minutes) params.set("window_minutes", String(opts.window_minutes));
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<PaginatedStatsClients>(
    `/stats/clients${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

// The stats API paginates but exposes no search parameters, so the dashboard pulls
// the whole (small: a few hundred) client list and filters it locally.
const ALL_CLIENTS_PAGE_SIZE = 200;
const ALL_CLIENTS_MAX_PAGES = 25;

export async function getAllStatsClients(opts: { window_minutes?: number } = {}) {
  // Keyed by id rather than pushed into an array: the backend list is ordered by
  // last-seen activity, so a client whose activity updates between page fetches can
  // shift pages and be returned twice. A Map absorbs that drift instead of yielding
  // duplicate rows (and duplicate React keys) downstream.
  const clients = new Map<number, UpdaterClient>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= ALL_CLIENTS_MAX_PAGES) {
    const result = await getStatsClients({
      page,
      page_size: ALL_CLIENTS_PAGE_SIZE,
      window_minutes: opts.window_minutes,
    });
    for (const client of result.data ?? []) {
      clients.set(client.id, client);
    }
    totalPages = result.total_pages;
    page += 1;
  }

  return Array.from(clients.values());
}

export async function getStatsClientDetail(id: number) {
  return apiFetch<StatsClientDetail>(
    `/stats/clients/${id}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export interface DeleteStatsClientResult {
  status: "deleted";
  client_id: number;
  /** Raw updater_events rows removed with the client; -1 if the API could not count them. */
  events_deleted: number;
}

// Removes the client row and its whole event history (events first, then the
// client, in one transaction on the API side). The fleet-wide hourly rollup is
// deliberately left alone, so the charts do not change.
export async function deleteStatsClient(id: number) {
  return apiFetch<DeleteStatsClientResult>(
    `/stats/clients/${id}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function getStatsEvents(opts: {
  product?: StatsProductFilter;
  bucket?: StatsEventBucket;
  event_type?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (opts.product) params.set("product", opts.product);
  if (opts.bucket) params.set("bucket", opts.bucket);
  if (opts.event_type) params.set("event_type", opts.event_type);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<StatsEventsResponse>(
    `/stats/events${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

// ── Remote Config ──────────────────────────────────────────────────────────
//
// The fleet-wide policy document served to the AryxD Agent and EMLy at
// GET /v2/config. See emly-api-go's
// docs/superpowers/specs/2026-09-04-remote-config-api-design.md (storage,
// revisions, admin routes) and emly-updater's
// docs/superpowers/specs/2026-09-04-remote-config-design.md (the document
// schema and validation rules this dashboard is not re-implementing).

export type RemoteConfigStatus = "draft" | "published" | "superseded";

export interface RemoteConfigProblem {
  path: string;
  message: string;
}

/**
 * The document itself is intentionally untyped beyond its required
 * top-level shape: the API's own validator (`internal/remoteconfig`)
 * ignores fields it doesn't recognize so either side can add one without a
 * schema bump, and this dashboard edits the document as raw JSON rather
 * than re-modeling its whole schema (servers, dcLookupMap, ipcProtocol,
 * control, updater, logging, overrides — see the client spec §7). A
 * structured, per-field editor is future work the API design doc leaves
 * room for.
 */
export type RemoteConfigDocument = {
  schemaVersion: number;
  revision?: number;
  generatedAt?: string;
  servers: Record<string, string>;
  defaultServer: string;
} & Record<string, unknown>;

/** Fields common to every shape the API returns for a revision. */
interface RemoteConfigRevisionBase {
  revision: number;
  schema_version: number;
  status: RemoteConfigStatus;
  etag: string;
  notes: string | null;
  created_by: string | null;
  based_on: number | null;
  generated_at: string;
  published_at: string | null;
  created_at: string;
}

/**
 * Metadata-only projection served by `GET /config/revisions` (the list).
 * clients_on_revision is a `COUNT(*)` the list query joins in — it does
 * *not* appear on the single-revision shapes below (get/create/publish/
 * rollback), which come straight off the `remote_config_revisions` row.
 */
export interface RemoteConfigRevisionSummary extends RemoteConfigRevisionBase {
  clients_on_revision: number;
}

/** One revision with its full document — get/create/publish/rollback. */
export interface RemoteConfigRevision extends RemoteConfigRevisionBase {
  document: RemoteConfigDocument;
}

export interface PaginatedConfigRevisions {
  page: number;
  page_size: number;
  total: number;
  revisions: RemoteConfigRevisionSummary[];
}

export interface ConfigPreviewHost {
  hwid?: string;
  hostname?: string;
  dc?: string;
  ips?: string[];
  domain?: string;
  /** RFC 3339; defaults to the server clock when omitted. */
  now?: string;
}

export interface ConfigPreviewResult {
  revision: number;
  effective_document: RemoteConfigDocument;
  applied_override_ids: string[];
  matched_site: string | null;
  resolver_chain: string[];
}

function configBase(): string {
  return env.apiBaseUrl + "/v2";
}

export async function getConfigRevisions(
  opts: { page?: number; page_size?: number; status?: RemoteConfigStatus } = {},
) {
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.page_size) params.set("page_size", String(opts.page_size));
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<PaginatedConfigRevisions>(
    `/config/revisions${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase() },
  );
}

export async function getConfigRevision(revision: number) {
  return apiFetch<RemoteConfigRevision>(
    `/config/revisions/${revision}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase() },
  );
}

/**
 * document must not carry `revision`/`generatedAt` — the API assigns both
 * and reports a submitted value back as a warning, not an error.
 * sessionToken, when given, attributes the revision to the signed-in admin
 * (`created_by`); omitted, the revision is created anonymously.
 */
export async function createConfigRevision(
  data: { document: unknown; notes?: string; publish?: boolean },
  opts: { sessionToken?: string } = {},
) {
  return apiFetch<RemoteConfigRevision & { warnings: RemoteConfigProblem[] }>(
    "/config/revisions",
    { method: "POST", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase(), sessionToken: opts.sessionToken },
  );
}

/** Only a draft revision can be deleted; it does not free the revision number. */
export async function deleteConfigRevision(revision: number) {
  return apiFetch<{ deleted: boolean }>(
    `/config/revisions/${revision}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase() },
  );
}

export async function publishConfigRevision(revision: number, opts: { sessionToken?: string } = {}) {
  return apiFetch<RemoteConfigRevision>(
    `/config/revisions/${revision}/publish`,
    { method: "POST" },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase(), sessionToken: opts.sessionToken },
  );
}

/**
 * The only rollback mechanism: clones `to`'s content into a new, higher
 * revision and publishes it — republishing `to` itself would hand the
 * fleet a lower number than it already has, which every client ignores.
 */
export async function rollbackConfig(
  data: { to: number; notes?: string },
  opts: { sessionToken?: string } = {},
) {
  return apiFetch<RemoteConfigRevision>(
    "/config/rollback",
    { method: "POST", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase(), sessionToken: opts.sessionToken },
  );
}

/** Validates a document without storing it — for a "check" button. */
export async function validateConfigDocument(document: unknown) {
  return apiFetch<{ valid: boolean; warnings: RemoteConfigProblem[] }>(
    "/config/validate",
    { method: "POST", body: JSON.stringify({ document }) },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase() },
  );
}

/**
 * Exactly one of `revision` (a stored revision) or `document` (inline, not
 * stored) must be given. Answers "what would this host actually see".
 */
export async function previewConfig(data: {
  revision?: number;
  document?: unknown;
  host: ConfigPreviewHost;
}) {
  return apiFetch<ConfigPreviewResult>(
    "/config/preview",
    { method: "POST", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false, baseUrl: configBase() },
  );
}

// ── Client channel (remote commands) ───────────────────────────────────────
// Admin half of `GET /v2/client/ws`: the API keeps the machines' WebSockets,
// this issues commands to them and reads back what they answered. Protocol in
// emly-go-api/CLIENT_WS_PROTOCOL.md. Mounted at /v2/client, not /v2/api.

function clientBase(): string {
  return env.apiBaseUrl + "/v2/client";
}

export type ClientCommandName =
  | "machine.info"
  | "emly.manifest.check"
  | "updater.manifest.check"
  | "apps.list_upgradable"
  | "service.restart"
  | "machine.reboot";

/** Lifecycle of a command on the API: sent -> acked -> done/failed, or rejected/timeout. */
export type ClientCommandStatus =
  | "sent"
  | "acked"
  | "rejected"
  | "done"
  | "failed"
  | "timeout";

export interface ClientProtoError {
  code: string;
  message?: string;
}

export interface ClientCommandRecord {
  id: string;
  client_id: number;
  name: ClientCommandName;
  args?: Record<string, unknown>;
  issued_by?: string;
  issued_at: string;
  expires_at: string;
  status: ClientCommandStatus;
  acked_at?: string;
  finished_at?: string;
  error?: ClientProtoError;
  result?: {
    status: string;
    duration_ms?: number;
    payload?: unknown;
    error?: ClientProtoError;
    truncated?: boolean;
  };
}

/** One event a machine pushed. The API keeps the last 50 per machine, in memory only. */
export interface ClientEventRecord {
  id?: string;
  client_id: number;
  name: string;
  received_at: string;
  client_ts?: string;
  payload?: unknown;
  truncated?: boolean;
}

// The session token lets the API refuse anyone who is not an owner (remote control is owner-only).
const clientOpts = (sessionToken?: string) => ({
  requiresAdmin: true,
  requiresApi: false,
  baseUrl: clientBase(),
  sessionToken,
});

export async function issueClientCommand(
  clientId: number,
  input: { name: ClientCommandName; args?: Record<string, unknown>; issued_by?: string },
  sessionToken?: string,
) {
  return apiFetch<ClientCommandRecord>(
    `/${clientId}/commands`,
    { method: "POST", body: JSON.stringify(input) },
    clientOpts(sessionToken),
  );
}

export async function getClientCommand(commandId: string, sessionToken?: string) {
  return apiFetch<ClientCommandRecord>(
    `/commands/${encodeURIComponent(commandId)}`,
    {},
    clientOpts(sessionToken),
  );
}

export async function getClientEvents(clientId: number, sessionToken?: string) {
  return apiFetch<{ events: ClientEventRecord[] }>(`/${clientId}/events`, {}, clientOpts(sessionToken));
}

// ── Download queue ─────────────────────────────────────────────────────────
// Caps how many installers (EMLy and Updater, one shared pool) the API serves
// at once. State lives in the API's RAM, per instance: every change here lasts
// until the next API restart. Mounted at /v2/download-queue, not /v2/api, and
// requires both X-Admin-Key and X-Dashboard-Key.

function downloadQueueBase(): string {
  return env.apiBaseUrl + "/v2/download-queue";
}

export type DownloadQueueProduct = "emly" | "updater";

export interface DownloadQueueSlot {
  id: number;
  product: DownloadQueueProduct;
  version: string;
  ip?: string;
  hostname?: string;
  hwid?: string;
  started_at: string;
  /** When the server timeout cuts this download. Fixed at start. */
  deadline_at: string;
  elapsed_seconds: number;
  bytes_sent: number;
  /** Missing for the first instants, before the release is opened on S3. */
  bytes_total?: number;
  /** 0-100; missing without `bytes_total`. */
  percent?: number;
  /** Average since the start, not instantaneous: starts low (lookup before the first byte). */
  avg_bytes_per_sec: number;
}

export interface DownloadQueueSettings {
  enabled: boolean;
  capacity: number;
  retry_after_seconds: number;
  /** Max duration of one download; applies to downloads started afterwards. */
  download_timeout_seconds: number;
}

/**
 * Known `failed_by_reason` keys. The API may add more: an unknown key is
 * shown as-is, never dropped.
 */
export type DownloadQueueFailReason =
  | "server timeout"
  | "client disconnected"
  | "copy failed"
  | "error response"
  | "internal error";

export interface DownloadQueueState extends DownloadQueueSettings {
  active: number;
  /** `capacity - active`, floored at 0: can be 0 with active > capacity after a shrink. */
  available: number;
  // Every started download ends in exactly one of completed/failed/evicted.
  completed_total: number;
  failed_total: number;
  /** Breakdown of `failed_total`; always an object. */
  failed_by_reason: Partial<Record<DownloadQueueFailReason, number>> & Record<string, number>;
  rejected_total: number;
  evicted_total: number;
  /** Sum of the slots' average speeds. */
  total_bytes_per_sec: number;
  /** The API's .env values, restored by the reset route. */
  defaults: DownloadQueueSettings;
  /** Oldest first; always an array. */
  slots: DownloadQueueSlot[];
}

const downloadQueueOpts = (sessionToken?: string) => ({
  requiresAdmin: true,
  requiresApi: false,
  baseUrl: downloadQueueBase(),
  sessionToken,
});

export async function getDownloadQueue() {
  return apiFetch<DownloadQueueState>("", {}, downloadQueueOpts());
}

export async function updateDownloadQueue(
  data: Partial<DownloadQueueSettings>,
  opts: { sessionToken?: string } = {},
) {
  return apiFetch<DownloadQueueState>(
    "",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    downloadQueueOpts(opts.sessionToken),
  );
}

export async function resetDownloadQueue(opts: { sessionToken?: string } = {}) {
  return apiFetch<DownloadQueueState>("/reset", { method: "POST" }, downloadQueueOpts(opts.sessionToken));
}

export async function evictDownloadQueueSlot(id: number, opts: { sessionToken?: string } = {}) {
  return apiFetch<{ evicted: number }>(
    `/slots/${id}`,
    { method: "DELETE" },
    downloadQueueOpts(opts.sessionToken),
  );
}

export async function evictAllDownloadQueueSlots(opts: { sessionToken?: string } = {}) {
  return apiFetch<{ evicted: number }>("/slots", { method: "DELETE" }, downloadQueueOpts(opts.sessionToken));
}
