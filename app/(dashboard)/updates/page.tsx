import Link from "next/link";
import { FileJson } from "lucide-react";
import { getReleases, getUpdateManifest } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ReleasesTable } from "@/components/releases-table";
import { CreateReleaseDialog } from "@/components/create-release-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UpdatesPage() {
  const [manifestResult, releasesResult, currentUserResult] = await Promise.allSettled([
    getUpdateManifest(),
    getReleases(),
    getCurrentUser(),
  ]);

  const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : null;
  const releases = releasesResult.status === "fulfilled" ? (releasesResult.value ?? []) : [];
  const currentUser = currentUserResult.status === "fulfilled" ? currentUserResult.value : null;
  const isAdmin = currentUser?.role === "admin";
  const manifestUrl = `${env.apiBaseUrl}/v2/updates/manifest`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Updates</h1>
          <p className="text-muted-foreground">Manage software releases and update channels.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={manifestUrl} target="_blank" rel="noopener noreferrer">
              <FileJson className="mr-2 h-4 w-4" />
              Show manifest
            </Link>
          </Button>
          {isAdmin && <CreateReleaseDialog />}
        </div>
      </div>

      {manifest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Stable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-mono text-2xl font-bold">{manifest.stableVersion}</p>
              <p className="truncate text-xs text-muted-foreground">{manifest.stableDownload}</p>
              {manifest.isCritical && (
                <Badge variant="destructive" className="mt-1">
                  Critical
                </Badge>
              )}
            </CardContent>
          </Card>

          {manifest.betaVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Beta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-mono text-2xl font-bold">{manifest.betaVersion}</p>
                <p className="truncate text-xs text-muted-foreground">{manifest.betaDownload}</p>
              </CardContent>
            </Card>
          )}

          {manifest.minRequiredVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Min Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-bold">{manifest.minRequiredVersion}</p>
                <p className="text-xs text-muted-foreground">
                  Clients below this version are blocked
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <ReleasesTable releases={releases} isAdmin={isAdmin} />
    </div>
  );
}
