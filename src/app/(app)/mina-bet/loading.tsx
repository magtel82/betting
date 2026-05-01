import { TopBar } from "@/components/nav/TopBar";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Mina slip" />
      <div className="sticky top-[61px] z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg gap-2 px-4 py-2.5">
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-[var(--primary)]" />
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
      <div className="mx-auto max-w-lg px-4 py-4">
        <ListSkeleton rows={3} />
      </div>
    </>
  );
}
