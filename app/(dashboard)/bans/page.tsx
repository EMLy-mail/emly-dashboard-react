import { getTranslations } from "next-intl/server";
import { getBans } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { BansTable } from "@/components/bans-table";
import { CreateBanDialog } from "@/components/create-ban-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { isAdminRole } from "@/lib/roles";

export default async function BansPage() {
  const [bans, currentUser, t] = await Promise.all([
    getBans(),
    getCurrentUser(),
    getTranslations("bans"),
  ]);
  const isAdmin = isAdminRole(currentUser?.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {isAdmin && <CreateBanDialog />}
      </div>

      {/* Worth stating on the page rather than in a doc nobody opens: a ban
          cuts the machine off from updates and config, not just from stats. */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t("effectNotice")}</AlertDescription>
      </Alert>

      <BansTable bans={bans} isAdmin={isAdmin} />
    </div>
  );
}
