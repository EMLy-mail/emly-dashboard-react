import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProductOptions } from "@/lib/products";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Re-read on every request, so a product created or assigned a moment ago
  // gets its sidebar group on the next navigation.
  const products = await getUserProductOptions();

  return (
    <div className="flex min-h-screen flex-col md:h-full md:flex-row">
      <Sidebar user={user} products={products.map(({ slug, name }) => ({ slug, name }))} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
