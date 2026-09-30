import "server-only";
import { getSessionToken } from "@/lib/auth";
import { getStatsHub, type StatsHub } from "./stats-hub";

/**
 * The signed-in user's hub for `product`, warmed by opening the page: from the
 * second render on, its snapshots stand in for the REST calls. Null without a
 * session, which the dashboard layout has already redirected away from.
 */
export async function getPageStatsHub(product: string): Promise<StatsHub | null> {
  const token = await getSessionToken();
  return token ? getStatsHub(token, product) : null;
}
