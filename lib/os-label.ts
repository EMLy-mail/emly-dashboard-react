/**
 * Windows 10 build number -> release name. The annual `YYH#` name where one
 * exists (19H1 .. 22H2, the codenames for 1903/1909/2004), the plain version
 * number for the older releases that never had one.
 * https://en.wikipedia.org/wiki/Windows_10_version_history
 */
const WINDOWS_10_RELEASES: Record<string, string> = {
  "10240": "1507",
  "10586": "1511",
  "14393": "1607",
  "15063": "1703",
  "16299": "1709",
  "17134": "1803",
  "17763": "1809",
  "18362": "19H1",
  "18363": "19H2",
  "19041": "20H1",
  "19042": "20H2",
  "19043": "21H1",
  "19044": "21H2",
  "19045": "22H2",
};

/**
 * "Windows 11 24H2 Professional (Build 26100.4652)" -> "Windows 11 Pro 24H2"
 * "Windows 10 Pro Professional 22H2 Professional (Build 19045.6093)" -> "Windows 10 Pro 22H2"
 *
 * The updater's wording varies between builds (release before or after the
 * edition, edition repeated), so the release and edition are pulled out
 * independently rather than matched as one fixed shape. `os_version` is opaque
 * by contract: anything not recognisably "Windows N ..." is returned untouched.
 */
export function shortOsLabel(osVersion: string | null | undefined): string | null {
  if (!osVersion) return null;
  const match = /^Windows\s+(\d+)\s+(.*)$/i.exec(osVersion.trim());
  if (!match) return osVersion;

  const [, major, rest] = match;
  const withoutBuild = rest.replace(/\(.*?\)/g, " ");
  // The build number is the reliable signal for Windows 10 (the wording of
  // the release name in the string is not); fall back to whatever the string
  // itself says when the build is unknown.
  const build = /\bBuild\s+(\d+)/i.exec(rest)?.[1];
  const release =
    (major === "10" && build ? WINDOWS_10_RELEASES[build] : undefined) ??
    /\b\d{2}H\d\b/i.exec(withoutBuild)?.[0].toUpperCase();

  const seen = new Set<string>();
  const edition = withoutBuild
    .replace(/\b\d{2}H\d\b/gi, " ")
    .split(/\s+/)
    .filter((word) => word && !/^\d{4}$/.test(word)) // "1809"-style versions, re-added via `release`
    .map((word) => (word.toLowerCase() === "professional" ? "Pro" : word))
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return ["Windows", major, ...edition, release].filter(Boolean).join(" ");
}

/** Major Windows version, or null when the string is not a recognisable Windows one. */
export function windowsMajor(osVersion: string | null | undefined): 10 | 11 | null {
  const match = /^Windows\s+(10|11)\b/i.exec(osVersion?.trim() ?? "");
  return match ? (Number(match[1]) as 10 | 11) : null;
}
