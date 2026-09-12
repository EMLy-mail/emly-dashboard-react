import { env, SERVER_USER_AGENT } from "@/lib/env";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const res = await fetch(`${env.apiBaseUrl}/v2/api/bug-report/${id}/files/${fileId}`, {
    headers: {
      "X-API-Key": env.apiKey,
      "X-Admin-Key": env.adminKey,
      "User-Agent": SERVER_USER_AGENT,
      ...(env.dashboardKey ? { "X-Dashboard-Key": env.dashboardKey } : {}),
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
