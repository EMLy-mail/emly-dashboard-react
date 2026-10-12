/**
 * Agent logs fetched with `log.send_latest` (CLIENT_WS_PROTOCOL.md §6.6, §7.7).
 *
 * No `server-only`: the remote-control panel decodes a fresh result in the
 * browser, while the download route and the server actions only need the id
 * check. Nothing here touches the network.
 */

/** A log id is the id of the command that fetched it: a 26-character ULID. */
export function isClientLogId(id: string): boolean {
  return /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(id);
}

/**
 * base64 -> gunzip -> text, with the platform's own DecompressionStream (no
 * library). The content comes from a machine: it is only ever rendered as
 * text, never as markup.
 */
export async function decodeGzipBase64(content: string): Promise<string> {
  const bin = atob(content);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export const LOG_LEVELS: readonly LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export interface LogLine {
  /** 1-based, counted within the text shown (not the whole file). */
  n: number;
  text: string;
  /** null for a line that is not slog's `level=...` (a panic trace, say). */
  level: LogLevel | null;
}

const LEVEL_RE = /\blevel=(DEBUG|INFO|WARN|ERROR)\b/;

/**
 * Splits the agent's log (slog text handler: `time=... level=INFO msg=...`)
 * into lines. A line without its own level - the continuation of a stack
 * trace - takes the level of the line it continues, so filtering by level
 * keeps a panic and its trace together.
 */
export function parseLogLines(text: string): LogLine[] {
  const raw = text.split(/\r?\n/);
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  let current: LogLevel | null = null;
  return raw.map((line, i) => {
    const m = LEVEL_RE.exec(line);
    if (m) current = m[1] as LogLevel;
    return { n: i + 1, text: line, level: m ? (m[1] as LogLevel) : current };
  });
}
