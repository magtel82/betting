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
      <div className="sticky top-[61px] z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg gap-2 px-4 py-2.5">
          <TabButton
            label={`Mina${mySlips.length > 0 ? ` (${mySlips.length})` : ""}`}
            active={tab === "mine"}
            onClick={() => setTab("mine")}
          />
          <TabButton
            label={`Alla${allSlips.length > 0 ? ` (${allSlips.length})` : ""}`}
            active={tab === "all"}
            onClick={() => setTab("all")}
          />
        </div>
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
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-[var(--primary)] text-white shadow-sm"
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
      <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--primary-50)] text-2xl">
          🎯
        </div>
        <p className="text-sm font-medium text-gray-700">Du har inte lagt några slip ännu</p>
        <p className="mt-1 text-xs text-gray-400">Dags att tippa första matcherna!</p>
        <Link
          href="/bet"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-xs font-bold text-white shadow-sm hover:bg-[var(--primary-600)]"
        >
          Lägg ditt första slip
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-2xl">
        📋
      </div>
      <p className="text-sm font-medium text-gray-700">Inga slip i ligan ännu</p>
      <p className="mt-1 text-xs text-gray-400">Var först ut!</p>
    </div>
  );
}
