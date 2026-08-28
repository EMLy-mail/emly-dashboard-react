import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24 hidden md:block" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-24 hidden lg:block" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-4 w-28 hidden lg:block" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

export default function StatisticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {["w-56", "w-44", "w-44", "w-52", "w-36"].map((w, i) => (
          <Skeleton key={i} className={`h-9 ${w}`} />
        ))}
      </div>

      <div className="rounded-md border">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/40">
          {["w-32", "w-24", "w-16", "w-24", "w-16", "w-28", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
