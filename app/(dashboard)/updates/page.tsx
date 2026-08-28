import Link from "next/link";
import { FileJson } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  getReleases,
  getUpdateManifest,
  getUpdaterManifest,
  getUpdaterReleases,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/utils";
import { ReleasesTable } from "@/components/releases-table";
import { CreateReleaseDialog } from "@/components/create-release-dialog";
import { UpdaterReleasesTable } from "@/components/updater-releases-table";
import { CreateUpdaterReleaseDialog } from "@/components/create-updater-release-dialog";
import { UpdatesTabs } from "@/components/updates-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UpdatesPage() {
  const t = await getTranslations("updates");

  const [
    manifestResult,
    releasesResult,
    updaterManifestResult,
    updaterReleasesResult,
    currentUserResult,
  ] = await Promise.allSettled([
    getUpdateManifest(),
    getReleases(),
    getUpdaterManifest(),
    getUpdaterReleases(),
    getCurrentUser(),
  ]);

  const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
  const releases = releasesResult.status === "fulfilled" ? (releasesResult.value ?? []) : [];
  const updaterManifest =
    updaterManifestResult.status === "fulfilled" ? updaterManifestResult.value : null;
  const updaterReleases =
    updaterReleasesResult.status === "fulfilled" ? (updaterReleasesResult.value ?? []) : [];
  const currentUser = currentUserResult.status === "fulfilled" ? currentUserResult.value : null;
  const isAdmin = currentUser?.role === "admin";
  const manifestUrl = `${env.facingUrl}/v2/updates/manifest`;
  const updaterManifestUrl = `${env.facingUrl}/v2/updates/manifest/updater`;
  // An empty (or absent) version is the "nothing to distribute" state.
  const updaterServedVersion = updaterManifest?.version || null;

  function toFacingUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      const facing = new URL(env.facingUrl);
      parsed.protocol = facing.protocol;
      parsed.host = facing.host;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  const emlySection = (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={manifestUrl} target="_blank" rel="noopener noreferrer">
            <FileJson className="mr-2 h-4 w-4" />
            {t("showManifest")}
          </Link>
        </Button>
        {isAdmin && <CreateReleaseDialog />}
      </div>

      {manifest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("manifest.stable")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-mono text-2xl font-bold">{manifest.stableVersion}</p>
              <p className="truncate text-xs text-muted-foreground">
                {toFacingUrl(manifest.stableDownload)}
              </p>
              {manifest.criticalVersion === manifest.stableVersion && (
                <Badge variant="destructive" className="mt-1">
                  {t("manifest.critical")}
                </Badge>
              )}
            </CardContent>
          </Card>

          {manifest.betaVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("manifest.beta")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-mono text-2xl font-bold">{manifest.betaVersion}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {toFacingUrl(manifest.betaDownload)}
                </p>
                {manifest.criticalVersion === manifest.betaVersion && (
                  <Badge variant="destructive" className="mt-1">
                    {t("manifest.critical")}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )}

          {manifest.minRequiredVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("manifest.minRequired")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-bold">{manifest.minRequiredVersion}</p>
                <p className="text-xs text-muted-foreground">{t("manifest.blockedBelow")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ReleasesTable releases={releases} isAdmin={isAdmin} />
    </>
  );

  const updaterSection = (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("updater.description")}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={updaterManifestUrl} target="_blank" rel="noopener noreferrer">
              <FileJson className="mr-2 h-4 w-4" />
              {t("updater.showManifest")}
            </Link>
          </Button>
          {isAdmin && <CreateUpdaterReleaseDialog />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("updater.manifest.served")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {updaterServedVersion ? (
              <>
                <p className="font-mono text-2xl font-bold">{updaterServedVersion}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {toFacingUrl(updaterManifest?.download)}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">
                  {t("updater.manifest.none")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("updater.manifest.noneHelp")}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {updaterServedVersion && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("updater.manifest.size")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-mono text-2xl font-bold">
                  {formatBytes(updaterManifest?.size ?? 0)}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={updaterManifest?.sha256}>
                  {updaterManifest?.sha256 ?? "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("updater.manifest.published")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {updaterManifest?.publishedAt
                    ? new Date(updaterManifest.publishedAt).toLocaleDateString()
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("updater.manifest.silentHelp")}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <UpdaterReleasesTable
        releases={updaterReleases}
        isAdmin={isAdmin}
        downloadBaseUrl={env.facingUrl}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <UpdatesTabs emly={emlySection} updater={updaterSection} />
    </div>
  );
}
