/**
 * Fleet health ranking for the /clients view.
 *
 * Deliberately free of `server-only` and of any import from `lib/api`'s fetch
 * layer: the same functions score rows on the server for the first paint and
 * re-score them in the browser as the stats stream pushes updates, so both
 * sides must agree bit for bit.
 */

import type { Ban, UpdaterClient } from "@/lib/api";

// ── Versions ───────────────────────────────────────────────────────────────

/**
 * How far behind a build is. The distinction carries the whole ranking: a
 * missed patch is a nag, a missed minor means the machine is running against
 * a contract the fleet has already moved off.
 */
export type VersionGap = "unknown" | "none" | "patch" | "minor" | "major";

/**
 * Leading numeric triple only. Real tags in this fleet carry suffixes
 * (`1.2.0b` appears in the published ipcProtocol ranges), and a suffix never
 * changes which release a build belongs to — only whether it is a prerelease
 * of it, which `compareVersions` handles separately.
 */
function parseVersion(raw: string): { parts: [number, number, number]; suffix: string } | null {
  const match = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/.exec(raw);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    suffix: match[4].trim(),
  };
}

/** -1 / 0 / 1, or null when either side is unparseable. */
export function compareVersions(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;

  for (let i = 0; i < 3; i++) {
    if (va.parts[i] !== vb.parts[i]) return va.parts[i] < vb.parts[i] ? -1 : 1;
  }
  // Same triple: a suffixed build (1.6.1b) is a prerelease of the clean tag,
  // so it sorts below it. Two different suffixes just compare as text.
  if (va.suffix === vb.suffix) return 0;
  if (!va.suffix) return 1;
  if (!vb.suffix) return -1;
  return va.suffix < vb.suffix ? -1 : 1;
}

export function versionGap(current: string | null | undefined, latest: string | null | undefined): VersionGap {
  if (!current || !latest) return "unknown";
  const vc = parseVersion(current);
  const vl = parseVersion(latest);
  if (!vc || !vl) return "unknown";

  const cmp = compareVersions(current, latest);
  if (cmp === null) return "unknown";
  // Ahead of the manifest counts as up to date, not as a gap — a test box on
  // tomorrow's build is not a machine anyone needs to chase.
  if (cmp >= 0) return "none";

  if (vc.parts[0] !== vl.parts[0]) return "major";
  if (vc.parts[1] !== vl.parts[1]) return "minor";
  return "patch";
}

// ── IPv4 ───────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const octets = ip.trim().split(".");
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const n = Number(octet);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt === null || netInt === null) return false;

  // A /0 mask would shift by 32, which JS wraps back to a no-op shift.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) >>> 0 === (netInt & mask) >>> 0;
}

/**
 * Orders addresses numerically, so 172.16.9.1 comes before 172.16.10.1.
 * Sorting them as text (or even as "numeric" text) puts .10 before .9,
 * which scrambles any attempt to read a subnet down the column.
 * Unparseable and missing addresses sort last in both directions.
 */
export function compareIps(a: string | null | undefined, b: string | null | undefined): number {
  const ia = a ? ipv4ToInt(a) : null;
  const ib = b ? ipv4ToInt(b) : null;
  if (ia === null && ib === null) return 0;
  if (ia === null) return 1;
  if (ib === null) return -1;
  return ia - ib;
}

const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16"];

/**
 * RFC 1918 (plus loopback and link-local), *not* "appears in dcLookupMap".
 * The two are independent on this fleet: 172.16.32.0/24 carries real
 * in-office machines but is in no site's `internalSubnets`, and scoring those
 * as externally-connected would flag a dozen healthy desks every morning.
 */
export function isInternalIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  if (ipv4ToInt(ip) === null) return false;
  return PRIVATE_RANGES.some((range) => inCidr(ip, range));
}

// ── Domain controller lookup ───────────────────────────────────────────────

export interface DcSite {
  internalSubnets?: string[];
  enabled?: boolean;
}

/** The `dcLookupMap` slice of the published remote-config document. */
export type DcLookupMap = Record<string, DcSite>;

/**
 * Every enabled site whose subnets contain this IP. Plural on purpose: sites
 * here overlap by design (DC-CB and DC-SU both claim 172.16.33.0/24), so
 * picking "the" DC would be a coin flip presented as a fact.
 */
export function matchDcSites(ip: string | null | undefined, map: DcLookupMap | null): string[] {
  if (!ip || !map) return [];
  return Object.entries(map)
    .filter(([, site]) => site.enabled !== false)
    .filter(([, site]) => (site.internalSubnets ?? []).some((subnet) => inCidr(ip, subnet)))
    .map(([name]) => name)
    .sort();
}

/** Pulls `dcLookupMap` out of a config document that may be a JSON string. */
export function readDcLookupMap(document: unknown): DcLookupMap | null {
  let doc = document;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object") return null;
  const map = (doc as Record<string, unknown>).dcLookupMap;
  if (!map || typeof map !== "object") return null;
  return map as DcLookupMap;
}

// ── Domain membership ──────────────────────────────────────────────────────

/**
 * "WORKGROUP" is what Windows reports for a machine that is *not* joined, so
 * it has to be read as absence rather than as the name of a domain.
 */
export function isDomainJoined(adDomain: string | null | undefined): boolean {
  const domain = (adDomain ?? "").trim();
  if (!domain) return false;
  return domain.toUpperCase() !== "WORKGROUP";
}

/**
 * True when the user is still logged on but no client is attached to their
 * session - typically an RDP window closed without signing out. The account
 * is still the machine's user, just not someone who is at it right now.
 */
export function isSessionDisconnected(client: Pick<UpdaterClient, "logged_user_state">): boolean {
  return client.logged_user_state === "disconnected";
}

// ── Bans ───────────────────────────────────────────────────────────────────

/**
 * A ban targets an identifier, not a client row, so a machine is blocked if
 * *any* of its three identifiers is listed.
 */
export function matchBans(client: UpdaterClient, bans: Ban[]): Ban[] {
  return bans.filter(
    (ban) =>
      (ban.ban_type === "hostname" && ban.value.toLowerCase() === client.hostname.toLowerCase()) ||
      (ban.ban_type === "hwid" && !!client.hwid && ban.value.toLowerCase() === client.hwid.toLowerCase()) ||
      (ban.ban_type === "ip" && !!client.last_ip && ban.value === client.last_ip),
  );
}

// ── Ranking ────────────────────────────────────────────────────────────────

export type DeviceRank = "ok" | "warning" | "critical";

/** Machine-readable reason codes; the UI maps these to translated strings. */
export type DeviceReason =
  | "outOfDomain"
  | "banned"
  | "updaterMinorBehind"
  | "updaterPatchBehind"
  | "appBehind"
  | "offline"
  | "publicIp"
  | "appVersionUnknown"
  | "updaterVersionUnknown";

export interface DeviceAssessment {
  rank: DeviceRank;
  /** Every rule that fired, in the order the rank was decided. */
  reasons: DeviceReason[];
  online: boolean;
  /** Which of the two signals `online` is actually resting on - see `presenceState`. */
  presence: PresenceState;
  domainJoined: boolean;
  internalIp: boolean;
  dcSites: string[];
  bans: Ban[];
  updaterGap: VersionGap;
  appGap: VersionGap;
}

export interface AssessInput {
  client: UpdaterClient;
  bans: Ban[];
  /** Version the updater self-update manifest is currently serving. */
  latestUpdaterVersion: string | null;
  /** `stableVersion` from the EMLy app manifest. */
  latestAppVersion: string | null;
  /**
   * Installed EMLy App build, from `client.emly_version`. Kept as its own
   * input rather than read off the client so a caller can score a machine
   * against a version it does not carry in that field yet; pass null and the
   * app-version rules sit out instead of guessing, which is what a client too
   * old to report it (or one with EMLy not installed) amounts to.
   */
  appVersion: string | null;
  dcLookupMap: DcLookupMap | null;
  /** Minutes of silence after which a client counts as offline. */
  windowMinutes: number;
  /** Evaluation clock, passed in so server and client score identically. */
  now: number;
}

export function isOnlineAt(
  client: Pick<UpdaterClient, "last_seen_at">,
  now: number,
  windowMinutes: number,
): boolean {
  return now - new Date(client.last_seen_at).getTime() <= windowMinutes * 60_000;
}

/**
 * Three states, not a boolean, because "online" has always meant two
 * different things this fleet conflates: an estimate from the last poll
 * (`last_seen_at` inside `windowMinutes`, up to N minutes stale by
 * construction) and, since the client's presence WebSocket
 * (`GET /v2/client/ws`), a fact reported in real time. `live` beats
 * `estimated` whenever both would apply - the poll can be temporarily behind
 * a machine whose WS connection is already up (a resumed connection after a
 * brief drop, say), never the other way around, so there is no case where
 * trusting the live signal over the estimate is the wrong call.
 *
 * `estimated` therefore does not mean "not live" - it means "no live signal
 * to go on", which covers three real situations this fleet has today and
 * will keep having for a while: a machine on an updater built before this
 * channel existed, a site whose remote-config document hasn't turned
 * `clientWs.enabled` on yet, and the up-to-`windowMinutes` lag between an API
 * restart (which drops every open connection) and a machine reconnecting.
 */
export type PresenceState = "live" | "estimated" | "offline";

export function presenceState(
  client: Pick<UpdaterClient, "online" | "last_seen_at">,
  now: number,
  windowMinutes: number,
): PresenceState {
  if (client.online) return "live";
  return isOnlineAt(client, now, windowMinutes) ? "estimated" : "offline";
}

/**
 * Scores one machine.
 *
 * Critical: out of domain, banned, or an updater a whole minor release behind
 *   — each of these means the machine is not reachable by normal fleet policy.
 * Warning: in domain and unbanned, but drifting — a patch behind, an app
 *   behind, or answering from a public address.
 * OK: domain-joined, internal, unbanned, both builds current.
 *
 * Reachability is reported but never scored — see the note on `offline` below.
 */
export function assessDevice(input: AssessInput): DeviceAssessment {
  const { client, bans, windowMinutes, now } = input;

  const presence = presenceState(client, now, windowMinutes);
  const online = presence !== "offline";
  const domainJoined = isDomainJoined(client.ad_domain);
  const internalIp = isInternalIp(client.last_ip);
  const dcSites = matchDcSites(client.last_ip, input.dcLookupMap);
  const matchedBans = matchBans(client, bans);
  const updaterGap = versionGap(client.updater_version, input.latestUpdaterVersion);
  const appGap = versionGap(input.appVersion, input.latestAppVersion);

  const reasons: DeviceReason[] = [];

  if (!domainJoined) reasons.push("outOfDomain");
  if (matchedBans.length > 0) reasons.push("banned");
  if (updaterGap === "minor" || updaterGap === "major") reasons.push("updaterMinorBehind");

  const critical = reasons.length > 0;

  if (!critical) {
    if (updaterGap === "patch") reasons.push("updaterPatchBehind");
    if (appGap === "patch" || appGap === "minor" || appGap === "major") reasons.push("appBehind");
    // Only meaningful once we have an address at all; a client that has never
    // reported one is unknown, not externally connected.
    if (client.last_ip && !internalIp) reasons.push("publicIp");
  }

  const rank: DeviceRank = critical ? "critical" : reasons.length > 0 ? "warning" : "ok";

  // Recorded after the rank is settled, so these describe a machine without
  // demoting it.
  //
  // Being offline is deliberately not a demerit: most of this fleet is desks
  // that get switched off at night, so scoring silence as a fault would turn
  // the whole board amber every evening and bury the machines that are
  // actually broken. It stays visible as a fact about the row instead. Note
  // this runs outside the `critical` guard, so an offline machine that is
  // also critical still says so.
  if (!online) reasons.push("offline");
  if (updaterGap === "unknown") reasons.push("updaterVersionUnknown");
  if (appGap === "unknown") reasons.push("appVersionUnknown");

  return { rank, reasons, online, presence, domainJoined, internalIp, dcSites, bans: matchedBans, updaterGap, appGap };
}

// ── Masking ────────────────────────────────────────────────────────────────

/** `172.16.34.111` → `172.16.***.***` — keeps the site readable, hides the host. */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "—";
  const octets = ip.split(".");
  if (octets.length !== 4) return "***";
  return `${octets[0]}.${octets[1]}.***.***`;
}

/**
 * `TREGCC\YBEVI` → `TREGCC\*****`. The domain stays: it is the same handful of
 * values across the whole fleet, so it identifies nobody, while the account
 * name is the part that names a person.
 */
export function maskUser(user: string | null | undefined): string {
  if (!user) return "—";
  const trimmed = user.trim();
  if (!trimmed) return "—";

  const sep = trimmed.lastIndexOf("\\");
  const domain = sep >= 0 ? trimmed.slice(0, sep + 1) : "";
  const account = sep >= 0 ? trimmed.slice(sep + 1) : trimmed;
  // A trailing separator leaves no account to hide; show the raw value rather
  // than a row of stars standing for nothing.
  if (!account) return trimmed;

  return `${domain}${"*".repeat(Math.min(account.length, 12))}`;
}

/** Keeps the last two characters so a masked serial can still be cross-checked. */
export function maskSerial(serial: string | null | undefined): string {
  if (!serial) return "—";
  const trimmed = serial.trim();
  if (trimmed.length <= 2) return "***";
  return `${"*".repeat(Math.min(trimmed.length - 2, 12))}${trimmed.slice(-2)}`;
}

/**
 * First AryxD Agent release that speaks the client channel's command
 * protocol (CLIENT_WS_PROTOCOL.md). An older updater holds the presence
 * socket open but does not understand a command frame.
 */
export const MIN_COMMAND_UPDATER_VERSION = "1.7.2";

/**
 * Whether a machine's updater can take remote commands. The numeric triple
 * decides: a suffixed build of the minimum (1.7.2b) counts, unlike in
 * `compareVersions`, where a suffix sorts a build below its clean tag - here
 * the question is "does this build have the feature", not "is it released".
 * An unreported or unparseable version is treated as too old.
 */
export function supportsRemoteCommands(updaterVersion: string | null | undefined): boolean {
  const m = updaterVersion?.trim().match(/^v?(\d+(?:\.\d+){0,2})/i);
  if (!m) return false;
  const cmp = compareVersions(m[1], MIN_COMMAND_UPDATER_VERSION);
  return cmp !== null && cmp >= 0;
}
