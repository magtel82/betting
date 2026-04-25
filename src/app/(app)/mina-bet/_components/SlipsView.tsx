"use client";

import { useState } from "react";
import Link from "next/link";
import { SlipCard, type SlipRow } from "./SlipCard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  slips:         SlipRow[];
  currentUserId: string;
}

// ─── SlipsView ────────────────────────────────────────────────────────────────

export function SlipsView({ slips, currentUserId }: Props) {
  const [tab, setTab] = useState<"mine" | "all">("mine");

  const mySlips  = slips.filter((s) => s.member?.user_id === currentUserId);
  const allSlips = slips;

  const visible  = tab === "mine" ? mySlips : allSlips;

  return (
    <div>
      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="sticky top-[57px] z-30 flex gap-1.5 border-b border-gray-200 bg-white px-4 py-2">
        <TabButton
          label={`Mina slip${mySlips.length > 0 ? ` (${mySlips.length})` : ""}`}
          active={tab === "mine"}
          onClick={() => setTab("mine")}
        />
        <TabButton
          label={`Alla slip${allSlips.length > 0 ? ` (${allSlips.length})` : ""}`}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-lg px-4 py-4 space-y-3">
        {visible.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          visible.map((slip) => (
            <SlipCard
              key={slip.id}
              slip={slip}
              showPlayer={tab === "all"}
              isOwn={slip.member?.user_id === currentUserId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabButton({
  label,
  active,
  onClick,
}: {
  label:   string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ tab }: { tab: "mine" | "all" }) {
  if (tab === "mine") {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
        <p className="text-sm text-gray-400">Du har inte lagt några slip ännu.</p>
        <Link href="/bet" className="mt-2 inline-block text-xs font-medium text-gray-900 underline underline-offset-2">
          Lägg ett slip
        </Link>
      </div>
    );
  }
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-gray-400">Inga slip har lagts i ligan ännu.</p>
    </div>
  );
}
