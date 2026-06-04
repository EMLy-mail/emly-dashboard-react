import { notFound } from "next/navigation";
import { getBugReport, getBugReportFiles } from "@/lib/api";
import { BugReportDetail } from "@/components/bug-report-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BugReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const reportId = parseInt(id, 10);

  if (isNaN(reportId)) notFound();

  let report, files;
  try {
    [{ report }, files] = await Promise.all([
      getBugReport(reportId),
      getBugReportFiles(reportId),
    ]);
  } catch {
    notFound();
  }

  return <BugReportDetail report={report} files={files} reportId={reportId} />;
}
