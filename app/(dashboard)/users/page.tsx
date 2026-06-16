import { getTranslations } from "next-intl/server";
import { getUsers } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { UsersTable } from "@/components/users-table";
import { CreateUserDialog } from "@/components/create-user-dialog";

export default async function UsersPage() {
  const [users, currentUser, t] = await Promise.all([
    getUsers(),
    getCurrentUser(),
    getTranslations("users"),
  ]);
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {isAdmin && <CreateUserDialog />}
      </div>
      <UsersTable users={users} isAdmin={isAdmin} />
    </div>
  );
}
