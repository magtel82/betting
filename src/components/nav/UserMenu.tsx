"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions";

interface UserMenuProps {
  displayName: string;
  coins: number;
}

export function UserMenu({ displayName, coins }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Person icon */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-500" aria-hidden>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span className="max-w-[100px] truncate font-medium sm:max-w-[160px]">{displayName}</span>
        <span className="hidden tabular-nums text-gray-500 sm:inline">
          {coins.toLocaleString("sv-SE")}&nbsp;🪙
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Coins – shown in dropdown on mobile where header hides it */}
          <div className="border-b border-gray-100 px-4 py-2.5 sm:hidden">
            <p className="text-xs text-gray-400">Saldo</p>
            <p className="tabular-nums text-sm font-semibold text-gray-900">
              {coins.toLocaleString("sv-SE")} 🪙
            </p>
          </div>
          <Link
            href="/profil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Min profil
          </Link>
          <div className="border-t border-gray-100">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                Logga ut
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
