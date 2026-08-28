"use server";

import { revalidatePath } from "next/cache";
import {
  createRelease,
  updateRelease,
  deleteRelease,
  setReleaseChannels,
  createUpdaterRelease,
  updateUpdaterRelease,
  deleteUpdaterRelease,
  ApiError,
  type ReleaseSeverity,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
}

export type ReleaseActionState = { error?: string; success?: boolean };

export async function createReleaseAction(
  _prevState: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  await requireAdmin();
  const file = formData.get("file") as File;
  const version = formData.get("version") as string;
  const short_note = (formData.get("short_note") as string) || undefined;
  const is_stable = formData.get("is_stable") === "true";
  const is_beta = formData.get("is_beta") === "true";
  const severity_type = (formData.get("severity_type") as ReleaseSeverity) || "none";
  const description_en = (formData.get("description_en") as string) || null;
  const description_it = (formData.get("description_it") as string) || null;
  const is_critical = formData.get("is_critical") === "true";
  const min_required_version = (formData.get("min_required_version") as string) || null;

  if (!file || file.size === 0) return { error: "Installer file is required" };

  try {
    await createRelease({
      file,
      version,
      short_note,
      is_stable,
      is_beta,
      severity_type,
      description_en,
      description_it,
      is_critical,
      critical_version: is_critical ? version : null,
      min_required_version,
    });

    revalidatePath("/updates");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to create release" };
  }
}

export async function updateReleaseAction(
  version: string,
  _prevState: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  await requireAdmin();
  const short_note = (formData.get("short_note") as string) || undefined;
  const is_stable = formData.get("is_stable") === "true";
  const is_beta = formData.get("is_beta") === "true";
  const severity_type = (formData.get("severity_type") as ReleaseSeverity) || undefined;
  const description_en = (formData.get("description_en") as string) || null;
  const description_it = (formData.get("description_it") as string) || null;
  const is_critical = formData.get("is_critical") === "true";
  const min_required_version = (formData.get("min_required_version") as string) || null;

  try {
    await updateRelease(version, {
      short_note,
      is_stable,
      is_beta,
      severity_type,
      description_en,
      description_it,
      is_critical,
      critical_version: is_critical ? version : null,
      min_required_version,
    });
    revalidatePath("/updates");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to update release" };
  }
}

export async function setReleaseChannelsAction(
  version: string,
  flags: { is_stable?: boolean; is_beta?: boolean },
) {
  await requireAdmin();
  await setReleaseChannels(version, flags);
  revalidatePath("/updates");
}

export async function deleteReleaseAction(version: string) {
  await requireAdmin();
  await deleteRelease(version);
  revalidatePath("/updates");
}

// ── EMLy Updater self-update releases ──────────────────────────────────────

/** `datetime-local` value -> RFC 3339, or undefined when left blank. */
function toRfc3339(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function createUpdaterReleaseAction(
  _prevState: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  await requireAdmin();
  const file = formData.get("file") as File;
  const version = formData.get("version") as string;
  const is_current = formData.get("is_current") === "true";
  const notes_it = (formData.get("notes_it") as string) || null;
  const notes_en = (formData.get("notes_en") as string) || null;
  const published_at = toRfc3339(formData.get("published_at")) ?? null;

  if (!file || file.size === 0) return { error: "Installer file is required" };

  try {
    await createUpdaterRelease({ file, version, is_current, notes_it, notes_en, published_at });
    revalidatePath("/updates");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to publish updater release" };
  }
}

export async function updateUpdaterReleaseAction(
  version: string,
  _prevState: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  await requireAdmin();
  // The API patches only the keys present; notes are always sent so an empty
  // field clears the stored note.
  const data: {
    is_current: boolean;
    notes_it: string;
    notes_en: string;
    published_at?: string;
  } = {
    is_current: formData.get("is_current") === "true",
    notes_it: (formData.get("notes_it") as string) ?? "",
    notes_en: (formData.get("notes_en") as string) ?? "",
  };
  const published_at = toRfc3339(formData.get("published_at"));
  if (published_at) data.published_at = published_at;

  try {
    await updateUpdaterRelease(version, data);
    revalidatePath("/updates");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to update updater release" };
  }
}

/**
 * Promotes a build (`true`) or pulls it (`false`). Clearing the served build
 * is the kill-switch: the manifest reverts to `{"version": ""}`.
 */
export async function setUpdaterReleaseCurrentAction(version: string, is_current: boolean) {
  await requireAdmin();
  await updateUpdaterRelease(version, { is_current });
  revalidatePath("/updates");
}

export async function deleteUpdaterReleaseAction(version: string) {
  await requireAdmin();
  await deleteUpdaterRelease(version);
  revalidatePath("/updates");
}
