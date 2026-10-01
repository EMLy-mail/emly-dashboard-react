import { MessageSquareMore, Package, type LucideIcon } from "lucide-react";

// Per-product icons, set by hand: the API's product registry has no icon
// field. A product missing here shows the generic package icon. EMLy keeps
// its PNG logo in the sidebar; this is what the other places show for it.
const PRODUCT_ICONS: Record<string, LucideIcon> = {
  "3g-rocketchat": MessageSquareMore,
};

export function productIcon(slug: string): LucideIcon {
  return PRODUCT_ICONS[slug] ?? Package;
}
