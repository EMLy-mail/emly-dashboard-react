import Link from "next/link";
import { AlertTriangle, FileJson } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  ApiError,
  getReleases,
  getUpdateManifest,
  getUpdaterManifest,
  getUpdaterReleases,
  productManifestPath,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultProduct, getUserProductOptions } from "@/lib/products";
import { STATS_PRODUCT_UPDATER } from "@/lib/product-rules";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { formatDate } from "@/lib/format-date";
import { isAdminRole } from "@/lib/roles";

// The Agent's tab. "updater" is a reserved product slug, so it cannot clash
// with a real product in `?product=`.
const UPDATER_TAB = STATS_PRODUCT_UPDATER;

interface PageProps {
  searchParams: Promise<{ product?: string }>;
}

export default async function UpdatesPage({ searchParams }: PageProps) {
  const [{ product: productParam }, t, defaultProduct, productOptions] = await Promise.all([
    searchParams,
    getTranslations("updates"),
    getDefaultProduct(),
    getUserProductOptions(),
  ]);

  // Null = the Agent's tab: asked for, or the only one a user with no
  // products has. A slug the user does not have (stale link, product taken
  // away) falls back to the default tab rather than asking the API for a 403.
  const assigned = productOptions.find((p) => p.slug === productParam)?.slug;
  const product = productParam === UPDATER_TAB ? null : (assigned ?? defaultProduct);
  const productName = productOptions.find((p) => p.slug === product)?.name ?? product ?? "";

  const tabs = [
    ...productOptions.map((p) => ({ value: p.slug, label: p.name })),
    { value: UPDATER_TAB, label: t("tabs.updater") },
  ];

  // Only the open tab is fetched.
  const skip = Promise.reject(null);
  skip.catch(() => {});
  const [
    manifestResult,
    releasesResult,
    updaterManifestResult,
    updaterReleasesResult,
    currentUserResult,
  ] = await Promise.allSettled([
    product ? getUpdateManifest(product) : skip,
    product ? getReleases(product) : skip,
    product ? skip : getUpdaterManifest(),
    product ? skip : getUpdaterReleases(),
    getCurrentUser(),
  ]);

  const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
  const releases = releasesResult.status === "fulfilled" ? (releasesResult.value ?? []) : [];
  // 403: product taken away since the page loaded; 404: product deleted.
  // Either way say so instead of showing an empty table as if it had none.
  const releasesError =
    releasesResult.status === "rejected" && releasesResult.reason instanceof ApiError
      ? releasesResult.reason
      : null;
  const updaterManifest =
    updaterManifestResult.status === "fulfilled" ? updaterManifestResult.value : null;
  const updaterReleases =
    updaterReleasesResult.status === "fulfilled" ? (updaterReleasesResult.value ?? []) : [];
  const currentUser = currentUserResult.status === "fulfilled" ? currentUserResult.value : null;
  const isAdmin = isAdminRole(currentUser?.role);
  const manifestUrl = product ? `${env.facingUrl}${productManifestPath(product)}` : null;
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

  const productSection = product && (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {manifestUrl && (
          <code className="truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {manifestUrl}
          </code>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {manifestUrl && (
            <Button variant="outline" asChild>
              <Link href={manifestUrl} target="_blank" rel="noopener noreferrer">
                <FileJson className="mr-2 h-4 w-4" />
                {t("showManifest")}
              </Link>
            </Button>
          )}
          {isAdmin && <CreateReleaseDialog product={product} productName={productName} />}
        </div>
      </div>

      {releasesError && (releasesError.status === 403 || releasesError.status === 404) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {releasesError.status === 403
              ? t("errors.notAssigned", { product: productName })
              : t("errors.notFound", { product: productName })}
          </AlertDescription>
        </Alert>
      )}

      {/* No stable release yet: the API still serves a manifest, with empty versions. */}
      {manifest?.stableVersion && (
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

      <ReleasesTable
        releases={releases}
        isAdmin={isAdmin}
        product={product}
        productName={productName}
      />
    </>
  );

  const updaterSection = (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("updater.description")}</p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                    ? formatDate(updaterManifest.publishedAt)
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

      <UpdatesTabs tabs={tabs} active={product ?? UPDATER_TAB} updaterValue={UPDATER_TAB}>
        {product ? productSection : updaterSection}
      </UpdatesTabs>
    </div>
  );
}
