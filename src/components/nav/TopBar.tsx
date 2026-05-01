"use client";

import Link from "next/link";

interface TopBarProps {
  title: string;
  showBack?: boolean;
}

export function TopBar({ title, showBack = false }: TopBarProps) {
  return (
    <header className="sticky top-10 z-40 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        {showBack && (
          <Link href="/" className="text-sm font-semibold text-[var(--primary)] hover:opacity-80">
            ← Tillbaka
          </Link>
        )}
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}
