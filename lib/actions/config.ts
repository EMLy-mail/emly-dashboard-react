"use server";

import { revalidatePath } from "next/cache";
import {
  createConfigRevision,
  deleteConfigRevision,
  getConfigRevision,
  publishConfigRevision,
  rollbackConfig,
  validateConfigDocument,
  previewConfig,
  ApiError,
  type ConfigPreviewHost,
  type ConfigPreviewResult,
  type RemoteConfigProblem,
} from "@/lib/api";
import { getCurrentUser, getSessionToken } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
}

/** JSON.parse with an error message shaped for display, not a stack trace. */
function parseDocumentJson(raw: string): { document?: unknown; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Document is required" };
  try {
    return { document: JSON.parse(trimmed) };
  } catch (e) {
    return { error: e instanceof Error ? `Invalid JSON: ${e.message}` : "Invalid JSON" };
  }
}

export type ConfigActionState = {
  error?: string;
  problems?: RemoteConfigProblem[];
  success?: boolean;
  revision?: number;
  warnings?: RemoteConfigProblem[];
};

export async function createConfigRevisionAction(
  _prevState: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Unauthorized" };
  }
  const raw = (formData.get("document") as string) ?? "";
  const notes = (formData.get("notes") as string) || undefined;
  const publish = formData.get("publish") === "true";

  const { document, error } = parseDocumentJson(raw);
  if (error) return { error };

  const sessionToken = await getSessionToken();
  try {
    const result = await createConfigRevision({ document, notes, publish }, { sessionToken });
    revalidatePath("/config");
    return { success: true, revision: result.revision, warnings: result.warnings };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, problems: e.problems };
    return { error: "Failed to create revision" };
  }
}

export type ValidateActionState = {
  checked?: boolean;
  valid?: boolean;
  error?: string;
  problems?: RemoteConfigProblem[];
  warnings?: RemoteConfigProblem[];
};

export async function validateConfigDocumentAction(
  _prevState: ValidateActionState,
  formData: FormData,
): Promise<ValidateActionState> {
  try {
    await requireAdmin();
  } catch {
    return { checked: true, valid: false, error: "Unauthorized" };
  }
  const raw = (formData.get("document") as string) ?? "";
  const { document, error } = parseDocumentJson(raw);
  if (error) return { checked: true, valid: false, error };

  try {
    const result = await validateConfigDocument(document);
    return { checked: true, valid: result.valid, warnings: result.warnings };
  } catch (e) {
    if (e instanceof ApiError) return { checked: true, valid: false, error: e.message, problems: e.problems };
    return { checked: true, valid: false, error: "Failed to validate document" };
  }
}

/** Fetches one revision's full document — for the read-only view dialog. */
export async function getConfigRevisionAction(revision: number) {
  await requireAdmin();
  return getConfigRevision(revision);
}

export async function publishConfigRevisionAction(revision: number) {
  await requireAdmin();
  const sessionToken = await getSessionToken();
  await publishConfigRevision(revision, { sessionToken });
  revalidatePath("/config");
}

export async function deleteConfigRevisionAction(revision: number) {
  await requireAdmin();
  await deleteConfigRevision(revision);
  revalidatePath("/config");
}

export async function rollbackConfigAction(
  _prevState: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Unauthorized" };
  }
  const to = Number(formData.get("to"));
  const notes = (formData.get("notes") as string) || undefined;
  if (!to) return { error: "Nothing to roll back to" };

  const sessionToken = await getSessionToken();
  try {
    const result = await rollbackConfig({ to, notes }, { sessionToken });
    revalidatePath("/config");
    return { success: true, revision: result.revision };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to roll back" };
  }
}

export type PreviewActionState = {
  error?: string;
  problems?: RemoteConfigProblem[];
  result?: ConfigPreviewResult;
};

export async function previewConfigAction(
  _prevState: PreviewActionState,
  formData: FormData,
): Promise<PreviewActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Unauthorized" };
  }
  const revisionRaw = (formData.get("revision") as string) || "";
  const documentRaw = (formData.get("document") as string) || "";
  const ipsRaw = (formData.get("ips") as string) || "";
  const nowLocal = (formData.get("now") as string) || "";

  const host: ConfigPreviewHost = {
    hwid: (formData.get("hwid") as string) || undefined,
    hostname: (formData.get("hostname") as string) || undefined,
    dc: (formData.get("dc") as string) || undefined,
    domain: (formData.get("domain") as string) || undefined,
    ips: ipsRaw
      ? ipsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
  };
  if (nowLocal) {
    const date = new Date(nowLocal);
    if (!Number.isNaN(date.getTime())) host.now = date.toISOString();
  }

  let document: unknown;
  let revision: number | undefined;
  if (revisionRaw) {
    revision = Number(revisionRaw);
  } else {
    const parsed = parseDocumentJson(documentRaw);
    if (parsed.error) return { error: parsed.error };
    document = parsed.document;
  }

  try {
    const result = await previewConfig({ revision, document, host });
    return { result };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, problems: e.problems };
    return { error: "Failed to preview" };
  }
}
