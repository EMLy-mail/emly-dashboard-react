import { cache } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApiError, getDownloadQueue, type DownloadQueueState } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { canManageDownloadQueue } from "@/lib/roles";
import { DownloadQueuePanel } from "@/components/download-queue-panel";

// One clock for SSR and hydration, so the "started 12 s ago" cells render the
// same on both sides.
const getRenderedAt = cache(() => Date.now());

export default async function DownloadQueuePage() {
  const user = await getCurrentUser();
  // Every control here changes whether installers can be downloaded; a
  // non-admin/owner has nothing to do on this page (the actions re-check the role).
  if (!canManageDownloadQueue(user?.role)) redirect("/updates");

  const t = await getTranslations("downloadQueue");

  let initialState: DownloadQueueState | null = null;
  let initialError: { status?: number; message: string } | null = null;
  try {
    initialState = await getDownloadQueue();
  } catch (e) {
    initialError =
      e instanceof ApiError
        ? { status: e.status, message: e.message }
        : { message: e instanceof Error ? e.message : "Unknown error" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <DownloadQueuePanel
        initialState={initialState}
        initialError={initialError}
        renderedAt={getRenderedAt()}
      />
    </div>
  );
}
