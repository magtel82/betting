import { TopBar } from "@/components/nav/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Specialbet" />
      <div className="mx-auto max-w-lg px-4 py-4 space-y-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
}
