import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getConfigRevisions } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { ConfigRevisionsTable } from "@/components/config-revisions-table";
import { CreateConfigRevisionDialog } from "@/components/create-config-revision-dialog";
import { ConfigPreviewDialog } from "@/components/config-preview-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

const STATUS_FILTERS = ["all", "draft", "published", "superseded"] as const;

export default async function ConfigPage({ searchParams }: PageProps) {
  const { page: pageStr, status } = await searchParams;
  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const page_size = 20;
  const statusFilter =
    status === "draft" || status === "published" || status === "superseded" ? status : undefined;

  const [t, revisionsResult, publishedResult, currentUser] = await Promise.all([
    getTranslations("config"),
    getConfigRevisions({ page, page_size, status: statusFilter }).catch(() => null),
    getConfigRevisions({ status: "published", page_size: 1 }).catch(() => null),
    getCurrentUser(),
  ]);

  const isAdmin = currentUser?.role === "admin";
  const revisions = revisionsResult?.revisions ?? [];
  const totalPages = revisionsResult ? Math.max(1, Math.ceil(revisionsResult.total / page_size)) : 1;
  const published = publishedResult?.revisions?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfigPreviewDialog revisions={revisions} defaultRevision={published?.revision ?? null} />
            <CreateConfigRevisionDialog />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("published.revision")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-mono text-2xl font-bold">
              {published ? `#${published.revision}` : "—"}
            </p>
            {!published && <p className="text-xs text-muted-foreground">{t("published.none")}</p>}
          </CardContent>
        </Card>

        {published && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("published.publishedAt")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {published.published_at ? new Date(published.published_at).toLocaleString() : "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("published.clientsOnRevision")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{published.clients_on_revision}</p>
                <p className="text-xs text-muted-foreground">{t("published.clientsHelp")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("published.createdBy")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="truncate text-2xl font-bold">
                  {published.created_by || t("table.anonymous")}
                </p>
                {published.notes && (
                  <p className="truncate text-xs text-muted-foreground" title={published.notes}>
                    {published.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = (statusFilter ?? "all") === s;
          const href = s === "all" ? "/config" : `/config?status=${s}`;
          return (
            <Button key={s} asChild variant={active ? "default" : "outline"} size="sm">
              <Link href={href}>{t(`filter.${s}`)}</Link>
            </Button>
          );
        })}
      </div>

      <ConfigRevisionsTable
        revisions={revisions}
        totalPages={totalPages}
        currentPage={page}
        status={statusFilter}
        isAdmin={isAdmin}
      />
    </div>
  );
}
