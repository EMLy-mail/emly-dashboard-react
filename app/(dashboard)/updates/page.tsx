import Link from "next/link";
import { FileJson } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getReleasesV3, getUpdateManifestV3, type ReleaseProduct } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ReleasesTable } from "@/components/releases-table";
import { CreateReleaseDialog } from "@/components/create-release-dialog";
import { UpdatesProductTabs } from "@/components/updates-product-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ product?: string }>;
}

function parseProduct(value: string | undefined): ReleaseProduct {
  return value === "updater" ? "updater" : "app";
}

export default async function UpdatesPage({ searchParams }: PageProps) {
  const t = await getTranslations("updates");
  const { product: productParam } = await searchParams;
  const product = parseProduct(productParam);

  const [manifestResult, releasesResult, currentUserResult] = await Promise.allSettled([
    getUpdateManifestV3(product),
    getReleasesV3(product),
    getCurrentUser(),
  ]);

  const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
  const releases = releasesResult.status === "fulfilled" ? (releasesResult.value ?? []) : [];
  const currentUser = currentUserResult.status === "fulfilled" ? currentUserResult.value : null;
  const isAdmin = currentUser?.role === "admin";
  const manifestUrl = `${env.facingUrl}/v3/updates/${product}/manifest`;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={manifestUrl} target="_blank" rel="noopener noreferrer">
              <FileJson className="mr-2 h-4 w-4" />
              {t("showManifest")}
            </Link>
          </Button>
          {isAdmin && <CreateReleaseDialog product={product} />}
        </div>
      </div>

      <UpdatesProductTabs product={product} />

      {manifest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("manifest.stable")}</CardTitle>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">{t("manifest.beta")}</CardTitle>
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
                <p className="text-xs text-muted-foreground">
                  {t("manifest.blockedBelow")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ReleasesTable releases={releases} isAdmin={isAdmin} product={product} />
    </div>
  );
}
