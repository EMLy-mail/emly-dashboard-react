import type { RemoteConfigProblem } from "@/lib/api";

/**
 * Renders the `problems`/`warnings` array the remote-config API returns
 * (JSON-pointer-style `path` + human `message`) so an operator sees every
 * issue at once rather than fixing one at a time.
 */
export function ConfigProblemsList({
  problems,
  tone = "destructive",
}: {
  problems: RemoteConfigProblem[] | undefined;
  tone?: "destructive" | "muted";
}) {
  if (!problems || problems.length === 0) return null;

  return (
    <ul
      className={`list-disc space-y-1 rounded-md border p-3 pl-8 text-xs ${
        tone === "destructive"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      {problems.map((p, i) => (
        <li key={i}>
          {p.path && <span className="font-mono">{p.path}</span>}
          {p.path && ": "}
          {p.message}
        </li>
      ))}
    </ul>
  );
}
