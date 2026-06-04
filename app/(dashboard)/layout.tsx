import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
