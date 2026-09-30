import { PackageX } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Shown by every product-scoped page to a user with no products assigned: the
 * API gives them empty lists, which would otherwise read as "nothing here".
 */
export async function NoProductsNotice() {
  const t = await getTranslations("products.none");

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-16 text-center">
      <PackageX className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">{t("title")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("description")}</p>
      </div>
    </div>
  );
}
