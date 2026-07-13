"use server";

import { revalidatePath } from "next/cache";
import {
  createReleaseV3,
  updateReleaseV3,
  deleteReleaseV3,
  promoteReleaseV3,
  ApiError,
  type ReleaseChannel,
  type ReleaseSeverity,
  type ReleaseProduct,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
}

export type ReleaseActionState = { error?: string; success?: boolean };

export async function createReleaseAction(
  product: ReleaseProduct,
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
    // The backend atomically clears the critical flag from other releases of the
    // same product when is_critical is true, and auto-archives any release
    // already in the target stable/beta slot for that product — no manual
    // reconciliation needed here.
    await createReleaseV3(product, {
      file,
      version,
      short_note,
      channel,
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
  product: ReleaseProduct,
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
    await updateReleaseV3(product, version, {
      short_note,
      channel,
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

export async function promoteReleaseAction(product: ReleaseProduct, version: string, channel: ReleaseChannel) {
  await requireAdmin();
  await promoteReleaseV3(product, version, channel);
  revalidatePath("/updates");
}

export async function deleteReleaseAction(product: ReleaseProduct, version: string) {
  await requireAdmin();
  await deleteReleaseV3(product, version);
  revalidatePath("/updates");
}
