"use server";

import { revalidatePath } from "next/cache";
import {
  createRelease,
  updateRelease,
  deleteRelease,
  setReleaseChannels,
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
