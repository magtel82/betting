"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/stallning",          label: "🏆 Lista" },
  { href: "/stallning/skams",    label: "💀 Skäms" },
  { href: "/stallning/kalender", label: "📅 Kalender" },
];

export function StallningTabs() {
  const pathname = usePathname();

  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 items-center justify-center rounded-lg py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
