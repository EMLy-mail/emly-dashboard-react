"use server";

import { revalidatePath } from "next/cache";
import {
  createRelease,
  updateRelease,
  deleteRelease,
  promoteRelease,
  ApiError,
  getReleases,
  type ReleaseChannel,
  type ReleaseSeverity,
  type Release,
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
  const channel = (formData.get("channel") as ReleaseChannel) || "archived";
  const severity_type = (formData.get("severity_type") as ReleaseSeverity) || "none";
  const description_en = (formData.get("description_en") as string) || null;
  const description_it = (formData.get("description_it") as string) || null;
  const is_critical = formData.get("is_critical") === "true";
  const min_required_version = (formData.get("min_required_version") as string) || null;

  if (!file || file.size === 0) return { error: "Installer file is required" };

  try {
    // Check if there's already a release in the same channel
    let existingReleases: Release[] = [];
    try {
      existingReleases = await getReleases(channel);
    } catch (e) {
      // If fetching releases fails, we can still attempt to create the release
      console.error("Failed to fetch existing releases:", e);
    } 
    console.log("Existing releases in channel:", existingReleases);

    const res = await createRelease({
      file,
      version,
      short_note,
      channel,
      severity_type,
      description_en,
      description_it,
      is_critical,
      min_required_version,
    });
    console.log(res.channel === existingReleases.find(r => r.channel === res.channel)?.channel);
    if(res.channel === existingReleases.find(r => r.channel === res.channel)?.channel) {
      // If there's an existing release in the same channel, we need to promote the old release to archived
      console.log("Promoting existing release to archived:", existingReleases.find(r => r.channel === res.channel));
      await promoteRelease(existingReleases.find(r => r.channel === res.channel)!.version, "archived");
    }
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
  const channel = (formData.get("channel") as ReleaseChannel) || undefined;
  const severity_type = (formData.get("severity_type") as ReleaseSeverity) || undefined;
  const description_en = (formData.get("description_en") as string) || null;
  const description_it = (formData.get("description_it") as string) || null;
  const is_critical = formData.get("is_critical") === "true";
  const min_required_version = (formData.get("min_required_version") as string) || null;

  try {
    await updateRelease(version, {
      short_note,
      channel,
      severity_type,
      description_en,
      description_it,
      is_critical,
      min_required_version,
    });
    revalidatePath("/updates");
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Failed to update release" };
  }
}

export async function promoteReleaseAction(version: string, channel: ReleaseChannel) {
  await requireAdmin();
  await promoteRelease(version, channel);
  revalidatePath("/updates");
}

export async function deleteReleaseAction(version: string) {
  await requireAdmin();
  await deleteRelease(version);
  revalidatePath("/updates");
}
