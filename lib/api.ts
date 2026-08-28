import "server-only";
import { env } from "./env";

// ── Types ──────────────────────────────────────────────────────────────────

export type BugReportStatus = "new" | "in_review" | "resolved" | "closed";
export type UserRole = "admin" | "user";

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
  created_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayname: string;
  role: UserRole;
  enabled: boolean;
}

// ── Error ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Base fetch ─────────────────────────────────────────────────────────────

type ApiOptions = {
  sessionToken?: string;
  requiresAdmin?: boolean;
  requiresApi?: boolean;
  baseUrl?: string;
};

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };

  if (opts.requiresApi !== false) {
    headers["X-API-Key"] = env.apiKey;
  }
  if (opts.requiresAdmin) {
    headers["X-Admin-Key"] = env.adminKey;
  }
  if (opts.sessionToken) {
    headers["X-Session-Token"] = opts.sessionToken;
  }
  if (env.dashboardKey) {
    headers["X-Dashboard-Key"] = env.dashboardKey;
  }
  if (!headers["Content-Type"] && init.method !== "PATCH" && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const base = opts.baseUrl ?? (env.apiBaseUrl + "/v1/api");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Unknown error");
  }

  return res.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  return apiFetch<{ session_id: string; user: AuthUser }>(
    "/admin/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    { requiresApi: false },
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
  return apiFetch<PaginatedBugReports>(`/bug-reports${qs}`, {}, { requiresApi: true, requiresAdmin: true });
}

export async function getBugReportCount(status?: BugReportStatus) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<{ count: number }>(`/bug-reports/count${qs}`, {}, { requiresApi: true });
}

export async function getBugReport(id: number) {
  return apiFetch<{ report: BugReport }>(
    `/bug-reports/${id}`,
    {},
    { requiresApi: true, requiresAdmin: true },
  );
}

export async function deleteBugReport(id: number) {
  return apiFetch<{ message: string }>(
    `/bug-reports/${id}`,
    { method: "DELETE" },
    { requiresApi: true, requiresAdmin: true },
  );
}

export async function updateBugReportStatus(id: number, status: BugReportStatus) {
  return apiFetch<{ message: string }>(
    `/bug-reports/${id}/status`,
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
    `/bug-reports/${id}/files`,
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

export async function updateUser(id: string, data: { displayname?: string; enabled?: boolean }) {
  return apiFetch<{ updated: boolean }>(
    `/admin/users/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
    { requiresAdmin: true, requiresApi: false },
  );
}

export async function deleteUser(id: string) {
  return apiFetch<{ deleted: boolean }>(
    `/admin/users/${id}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false },
  );
}

export async function resetUserPassword(id: string, password: string) {
  return apiFetch<{ updated: boolean }>(
    `/admin/users/${id}/reset-password`,
    { method: "POST", body: JSON.stringify({ password }) },
    { requiresAdmin: true, requiresApi: false },
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

export async function getUpdateManifest() {
  return apiFetch<UpdateManifest>(
    "/updates/manifest",
    {},
    { requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function getReleases(channel?: ReleaseChannel) {
  const qs = channel ? `?channel=${channel}` : "";
  return apiFetch<Release[]>(
    `/updates/releases${qs}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function createRelease(data: {
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
    "/updates/releases",
    { method: "POST", body: form },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function deleteRelease(version: string) {
  return apiFetch<{ deleted: boolean }>(
    `/updates/releases/${encodeURIComponent(version)}`,
    { method: "DELETE" },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function updateRelease(
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
    `/updates/releases/${encodeURIComponent(version)}`,
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
 * whoever currently holds that slot; the two flags are independent, so a
 * release may hold both at once. Setting a flag to false just clears it.
 */
export async function setReleaseChannels(
  version: string,
  flags: { is_stable?: boolean; is_beta?: boolean },
) {
  return apiFetch<{ version: string; is_stable: boolean; is_beta: boolean }>(
    `/updates/releases/${encodeURIComponent(version)}/channel`,
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
 * Self-update contract for the EMLy Updater. Deliberately poorer than
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
}

export interface UpdaterEvent {
  id: number;
  client_id: number;
  event_type: UpdaterEventType;
  version?: string | null;
  ip_address?: string | null;
  created_at: string;
}

export interface StatsSummary {
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

export interface StatsClientDetail {
  client: UpdaterClient;
  events: UpdaterEvent[];
}

export interface StatsEventsResponse {
  bucket: StatsEventBucket;
  from: string;
  to: string;
  data: { bucket: string; event_type: string; count: number }[];
}

export async function getStatsSummary(windowMinutes?: number) {
  const qs = windowMinutes ? `?window_minutes=${windowMinutes}` : "";
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

export async function getStatsClientDetail(id: number) {
  return apiFetch<StatsClientDetail>(
    `/stats/clients/${id}`,
    {},
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}

export async function getStatsEvents(opts: {
  bucket?: StatsEventBucket;
  event_type?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
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
