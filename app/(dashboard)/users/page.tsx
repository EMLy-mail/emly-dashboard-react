import { getUsers } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { UsersTable } from "@/components/users-table";
import { CreateUserDialog } from "@/components/create-user-dialog";

export default async function UsersPage() {
  const [users, currentUser] = await Promise.all([getUsers(), getCurrentUser()]);
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Manage admin dashboard users.</p>
        </div>
        {isAdmin && <CreateUserDialog />}
      </div>
      <UsersTable users={users} isAdmin={isAdmin} />
    </div>
  );
}
