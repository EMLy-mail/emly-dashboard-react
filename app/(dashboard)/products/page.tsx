import { getTranslations } from "next-intl/server";
import { getProducts, type Product } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { userProductSlugs } from "@/lib/products";
import { isAdminRole } from "@/lib/roles";
import { CreateProductButton, ProductsTable } from "@/components/products-table";
import { NoProductsNotice } from "@/components/no-products-notice";

export default async function ProductsPage() {
  const [t, user] = await Promise.all([getTranslations("products"), getCurrentUser()]);
  // Scoped by the session: only the products assigned to this user.
  const products = await getProducts().catch((): Product[] => []);
  const isAdmin = isAdminRole(user?.role);
  const hasProducts = userProductSlugs(user).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {/* An admin with no products can still create one: it comes back assigned to them. */}
        {isAdmin && <CreateProductButton />}
      </div>
      {hasProducts ? <ProductsTable products={products} isAdmin={isAdmin} /> : <NoProductsNotice />}
    </div>
  );
}
