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
  minRequiredVersion?: string;
  sha256Checksums: Record<string, string>;
  releaseNotes: Record<string, string>;
  detailedReleaseNotes?: Record<string, DetailedNote>;
}

export interface Release {
  version: string;
  channel: ReleaseChannel;
  download_filename: string;
  sha256_checksum: string;
  short_note: string;
  severity_type: ReleaseSeverity;
  description_en: string | null;
  description_it: string | null;
  is_critical: boolean;
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
  channel?: ReleaseChannel;
  severity_type?: ReleaseSeverity;
  description_en?: string | null;
  description_it?: string | null;
  is_critical?: boolean;
  min_required_version?: string | null;
}) {
  const form = new FormData();
  form.append("file", data.file);
  form.append("version", data.version);
  if (data.channel) form.append("channel", data.channel);
  if (data.short_note) form.append("short_note", data.short_note);
  if (data.severity_type) form.append("severity_type", data.severity_type);
  if (data.description_en) form.append("description_en", data.description_en);
  if (data.description_it) form.append("description_it", data.description_it);
  form.append("is_critical", data.is_critical ? "true" : "false");
  if (data.min_required_version) form.append("min_required_version", data.min_required_version);

  return apiFetch<{ version: string; channel: ReleaseChannel; download_filename: string; sha256_checksum: string }>(
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
    channel?: ReleaseChannel;
    severity_type?: ReleaseSeverity;
    description_en?: string | null;
    description_it?: string | null;
    is_critical?: boolean;
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

export async function promoteRelease(version: string, channel: ReleaseChannel) {
  return apiFetch<{ version: string; channel: ReleaseChannel }>(
    `/updates/releases/${encodeURIComponent(version)}/channel`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    },
    { requiresAdmin: true, requiresApi: false, baseUrl: updatesBase() },
  );
}
