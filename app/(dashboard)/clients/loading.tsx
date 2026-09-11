import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ClientsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-4 w-28" />
        {["w-24", "w-24", "w-20"].map((w, i) => (
          <Skeleton key={i} className={`h-6 ${w}`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="rounded-md border">
          <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
            {["w-4", "w-28", "w-32", "w-24", "w-16", "w-28"].map((w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="hidden h-4 w-24 lg:block" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 pt-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
