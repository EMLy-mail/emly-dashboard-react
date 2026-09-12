import { env, SERVER_USER_AGENT } from "@/lib/env";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const res = await fetch(`${env.apiBaseUrl}/v1/api/bug-reports/${id}/download`, {
    headers: {
      "X-API-Key": env.apiKey,
      "X-Admin-Key": env.adminKey,
      "User-Agent": SERVER_USER_AGENT,
    },
  });

  if (!res.ok) notFound();

  return new Response(res.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ?? `attachment; filename="report-${id}.zip"`,
    },
  });
}
