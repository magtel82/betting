import { TopBar } from "@/components/nav/TopBar";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <TopBar title="Lägg slip" />
      <div className="mx-auto max-w-[900px] px-4 py-4">
        <div className="lg:flex lg:gap-8">
          <div className="min-w-0 lg:flex-[3] space-y-6">
            <ListSkeleton rows={5} />
          </div>
        </div>
      </div>
    </>
  );
}
