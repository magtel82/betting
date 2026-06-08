"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StallningTabs() {
  const pathname = usePathname();
  const isSkams = pathname === "/stallning/skams";

  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1">
      <Link
        href="/stallning"
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
          !isSkams
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        🏆 Topplista
      </Link>
      <Link
        href="/stallning/skams"
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
          isSkams
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        🏆💀 Heder & Skäms
      </Link>
    </div>
  );
}
