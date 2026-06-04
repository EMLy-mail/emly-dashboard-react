import { getBugReports } from "@/lib/api";
import { BugReportsTable } from "@/components/bug-reports-table";
import { BugReportSearch } from "@/components/bug-report-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function BugReportsPage({ searchParams }: PageProps) {
  const { page: pageStr, search } = await searchParams;
  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const page_size = 20;

  const reports = await getBugReports({ page, page_size, search });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bug Reports</h1>
          <p className="text-muted-foreground">Manage and triage incoming bug reports.</p>
        </div>
        <Card className="w-32">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <p className="text-2xl font-bold">{reports.total}</p>
          </CardContent>
        </Card>
      </div>
      <BugReportSearch defaultValue={search} />
      <BugReportsTable
        data={reports.data}
        totalPages={reports.total_pages}
        currentPage={page}
        search={search}
      />
    </div>
  );
}
