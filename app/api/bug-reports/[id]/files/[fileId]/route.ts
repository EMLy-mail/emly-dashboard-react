import { env } from "@/lib/env";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const res = await fetch(`${env.apiBaseUrl}/bug-reports/${id}/files/${fileId}`, {
    headers: {
      "X-API-Key": env.apiKey,
      "X-Admin-Key": env.adminKey,
    },
  });

  if (!res.ok) notFound();

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
