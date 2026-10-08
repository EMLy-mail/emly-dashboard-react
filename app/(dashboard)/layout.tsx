import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProductOptions } from "@/lib/products";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Re-read on every request, so a product created or assigned a moment ago
  // gets its sidebar group on the next navigation.
  const products = await getUserProductOptions();
  // Read here rather than on the client, so a collapsed sidebar does not flash open on load.
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-screen flex-col md:h-full md:flex-row">
      <Sidebar
        user={user}
        products={products.map(({ slug, name }) => ({ slug, name }))}
        defaultCollapsed={sidebarCollapsed}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
