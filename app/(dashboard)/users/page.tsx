import { getTranslations } from "next-intl/server";
import { getUserProducts, getUsers } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getUserProductOptions } from "@/lib/products";
import { UsersTable } from "@/components/users-table";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { canAssignProducts, isAdminRole } from "@/lib/roles";

export default async function UsersPage() {
  const [users, currentUser, t, productOptions] = await Promise.all([
    getUsers(),
    getCurrentUser(),
    getTranslations("users"),
    getUserProductOptions(),
  ]);
  const isAdmin = isAdminRole(currentUser?.role);
  const canAssign = canAssignProducts(currentUser?.role);

  // One call per user: the list has no products field. Loaded for admins
  // only, and a failure just leaves that user's cell empty.
  const productsByUser = isAdmin
    ? Object.fromEntries(
        await Promise.all(
          users.map(async (u) => [
            u.id,
            await getUserProducts(u.id)
              .then((r) => r.products ?? [])
              .catch((): string[] => []),
          ]),
        ),
      )
    : null;
  const productNames = Object.fromEntries(productOptions.map((p) => [p.slug, p.name]));
  const assignableProducts = productOptions.map(({ slug, name }) => ({ slug, name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {isAdmin && (
          <CreateUserDialog assignableProducts={canAssign ? assignableProducts : null} />
        )}
      </div>
      <UsersTable
        users={users}
        isAdmin={isAdmin}
        actor={currentUser ? { id: currentUser.id, role: currentUser.role } : null}
        productsByUser={productsByUser}
        productNames={productNames}
        canAssign={canAssign}
        assignableProducts={assignableProducts}
      />
    </div>
  );
}
