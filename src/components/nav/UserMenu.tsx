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
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-gray-50 active:bg-gray-100"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {/* Avatar circle */}
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[90px] truncate text-xs font-semibold text-gray-800 sm:max-w-[140px]">
          {displayName}
        </span>
        {/* Coins — always shown */}
        <span className="hidden tabular-nums text-xs font-semibold text-gray-700 xs:inline sm:inline">
          {coins.toLocaleString("sv-SE")}&nbsp;<span className="text-[var(--coin)]">🪙</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Coins — always show in dropdown too */}
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Saldo</p>
            <p className="mt-0.5 tabular-nums text-sm font-bold text-gray-900">
              {coins.toLocaleString("sv-SE")} <span className="text-[var(--coin)]">🪙</span>
            </p>
          </div>
          <Link
            href="/profil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-400" aria-hidden>
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Min profil
          </Link>
          <div className="border-t border-gray-100">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--loss)] hover:bg-[var(--loss-50)] active:bg-red-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
                Logga ut
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
