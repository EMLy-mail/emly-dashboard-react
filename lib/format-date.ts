// Fixed locale and zone: SSR runs on the server's locale/zone and hydration on
// the browser's, so anything left implicit renders differently on each side
// and React reports a hydration mismatch.
const LOCALE = "it-IT";
const TIME_ZONE = "Europe/Rome";

type DateInput = string | number | Date;

/** "10/09/2026" */
export function formatDate(value: DateInput): string {
  return new Date(value).toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
}

/** "10/09/2026, 17:51:22" */
export function formatDateTime(value: DateInput): string {
  return new Date(value).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
}
