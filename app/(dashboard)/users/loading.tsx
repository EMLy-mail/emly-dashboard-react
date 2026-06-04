import { Skeleton } from "@/components/ui/skeleton";

function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-32 flex-1" />
      <Skeleton className="h-5 w-14 rounded-full" />
      <Skeleton className="h-5 w-14 rounded-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
    </div>
  );
}

export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="rounded-md border">
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/40">
          {["w-24", "w-32", "w-12", "w-12", "w-20"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <UserRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
