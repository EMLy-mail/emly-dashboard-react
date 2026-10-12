import { fetchClientLogContent } from "@/lib/api";
import { getCurrentUser, getSessionToken } from "@/lib/auth";
import { isClientLogId } from "@/lib/client-logs";
import { canUseRemoteControl } from "@/lib/roles";

/**
 * Proxies an agent log kept by the API (`GET /v2/client/logs/{id}/content`)
 * so the admin key never reaches the browser. Same audience as remote
 * control, re-checked here: the route is reachable on its own.
 *
 * `?format=gz` passes the stored gzip through; anything else is the text.
 * The body is what a machine wrote, so it always goes out as an attachment
 * with nosniff - the viewer reads it with fetch(), a browser never renders it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canUseRemoteControl(user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  if (!isClientLogId(id)) return Response.json({ error: "Invalid log id" }, { status: 400 });

  const format = new URL(request.url).searchParams.get("format") === "gz" ? "gz" : "text";
  const res = await fetchClientLogContent(id, format, await getSessionToken());
  if (!res.ok) {
    const status = res.status === 404 ? 404 : 502;
    return Response.json({ error: status === 404 ? "Log not found" : "Log unavailable" }, { status });
  }

  const fallbackName = format === "gz" ? `${id}.log.gz` : `${id}.log`;
  return new Response(res.body, {
    headers: {
      "Content-Type": format === "gz" ? "application/gzip" : "text/plain; charset=utf-8",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? `attachment; filename="${fallbackName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
