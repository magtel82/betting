import { TopBar } from "@/components/nav/TopBar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Grupper" />
      <div className="sticky top-[61px] z-30 flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-12 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mx-auto max-w-lg px-4 py-4 space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <Skeleton className="h-4 w-20" />
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
