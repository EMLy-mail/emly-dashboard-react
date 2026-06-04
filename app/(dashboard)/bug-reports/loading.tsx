import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-4 w-8 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-48 hidden md:block" />
      <Skeleton className="h-4 w-20 hidden lg:block" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
    </div>
  );
}

export default function BugReportsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Card className="w-32">
          <CardHeader className="pb-1 pt-3 px-4">
            <Skeleton className="h-3 w-8" />
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <Skeleton className="h-7 w-12" />
          </CardContent>
        </Card>
      </div>

      <Skeleton className="h-9 w-64" />

      <div className="rounded-md border">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/40">
          {["w-8", "w-24", "w-32", "w-20", "w-16", "w-8", "w-20"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
