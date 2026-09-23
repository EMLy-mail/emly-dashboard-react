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
  const release = /\b\d{2}H\d\b/i.exec(withoutBuild)?.[0].toUpperCase();

  const seen = new Set<string>();
  const edition = withoutBuild
    .replace(/\b\d{2}H\d\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
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
