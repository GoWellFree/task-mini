export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-nova-skeleton rounded-md bg-surface-secondary ${className}`} />;
}

export function TaskItemSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2.5">
      <Skeleton className="h-6 w-6 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border-subtle p-4">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-4 h-2 w-full rounded-pill" />
    </div>
  );
}
