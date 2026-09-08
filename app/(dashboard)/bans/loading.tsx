import { Skeleton } from "@/components/ui/skeleton";

function BanRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-4 w-48 flex-1" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
    </div>
  );
}

export default function BansLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <Skeleton className="h-12 w-full rounded-lg" />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full rounded-md sm:w-72" />
        <Skeleton className="h-9 w-full rounded-md sm:w-44" />
      </div>

      <div className="rounded-md border">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/40">
          {["w-12", "w-40", "w-24", "w-20", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <BanRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
