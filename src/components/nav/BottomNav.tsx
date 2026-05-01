"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function BetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function SlipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  );
}

function GroupsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="9" x2="9" y2="21"/>
    </svg>
  );
}

function LeaderboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="18" y1="20" x2="18" y2="9"/>
      <line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

const navItems = [
  { href: "/",          label: "Hem",       Icon: HomeIcon },
  { href: "/bet",       label: "Spela",     Icon: BetIcon },
  { href: "/mina-bet",  label: "Mina bet",  Icon: SlipIcon },
  { href: "/grupper",   label: "Grupper",   Icon: GroupsIcon },
  { href: "/stallning", label: "Ställning", Icon: LeaderboardIcon },
  { href: "/profil",    label: "Profil",    Icon: PersonIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-[var(--primary)]"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {/* Small active indicator dot above icon */}
              <span
                className={`mb-0.5 h-0.5 w-4 rounded-full transition-opacity ${
                  isActive ? "bg-[var(--primary)] opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
              <Icon
                className={`h-5 w-5 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`}
              />
              <span className={isActive ? "font-semibold" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
