import { env } from "@/lib/env";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const res = await fetch(`${env.apiBaseUrl}/v1/api/bug-reports/${id}/files/${fileId}`, {
    headers: {
      "X-API-Key": env.apiKey,
      "X-Admin-Key": env.adminKey,
    },
  });
  console.log(res)

  if (!res.ok) notFound();

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
