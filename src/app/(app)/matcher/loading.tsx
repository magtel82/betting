import { TopBar } from "@/components/nav/TopBar";
import { Skeleton, ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Matcher" />
      <div className="sticky top-[61px] z-30 flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mx-auto max-w-lg px-4 py-4">
        <ListSkeleton rows={6} />
      </div>
    </>
  );
}
