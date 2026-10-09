import { SESSION_STATES, type SessionState } from "@/lib/device-status";

/**
 * Filters /clients accepts from its URL, so another page can link straight
 * to a filtered view (the statistics fleet charts do, one link per bar).
 *
 * The values are the clients explorer's own filter keys, matched exactly:
 * `connected` takes internal / public / offline, `lastSeen` an age bracket,
 * `os` the `shortOsLabel` name, the versions the raw reported string. An
 * empty value is the "(blank)" entry - a machine that reports nothing there.
 * Repeat a parameter to allow several values.
 */
export interface ClientsUrlFilters {
  ws?: "connected" | "disconnected";
  connected?: string[];
  lastSeen?: string[];
  updaterVersion?: string[];
  os?: string[];
  /** Not a table column: applied on its own and shown as a removable chip. */
  emlyVersion?: string[];
  /** Logged-user state, as `sessionState` classifies it. Also a chip. */
  session?: SessionState[];
}

const LIST_KEYS = ["connected", "lastSeen", "updaterVersion", "os", "emlyVersion", "session"] as const;

export function clientsHref(filters: ClientsUrlFilters): string {
  const params = new URLSearchParams();
  if (filters.ws) params.set("ws", filters.ws);
  for (const key of LIST_KEYS) {
    for (const value of filters[key] ?? []) params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `/clients?${qs}` : "/clients";
}

export function parseClientsFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ClientsUrlFilters {
  const filters: ClientsUrlFilters = {};
  const ws = searchParams.ws;
  if (ws === "connected" || ws === "disconnected") filters.ws = ws;
  for (const key of LIST_KEYS) {
    const raw = searchParams[key];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (key === "session") {
      // Unknown states are dropped rather than filtering the list down to nothing.
      const states = values.filter((v): v is SessionState => (SESSION_STATES as string[]).includes(v));
      if (states.length > 0) filters.session = states;
    } else {
      filters[key] = values;
    }
  }
  return filters;
}
