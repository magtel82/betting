"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SlipCard, type SlipRow } from "./SlipCard";
import type { SlipStatus } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  slips:         SlipRow[];
  currentUserId: string;
  newSlipId?:    string;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type Tab          = "mine" | "all";
type StatusFilter = "all" | "active" | "won" | "lost" | "void";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all",    label: "Alla"       },
  { id: "active", label: "Aktiva"     },
  { id: "won",    label: "Vunna"      },
  { id: "lost",   label: "Förlorade"  },
  { id: "void",   label: "Ogiltiga"   },
];

// ─── Sorting ──────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<SlipStatus, number> = {
  open:      0,
  locked:    1,
  won:       2,
  lost:      2,
  void:      3,
  cancelled: 4,
};

function sortSlips(slips: SlipRow[]): SlipRow[] {
  return [...slips].sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
  });
}

// ─── SlipsView ────────────────────────────────────────────────────────────────

export function SlipsView({ slips, currentUserId, newSlipId }: Props) {
  const [tab,           setTab]           = useState<Tab>("mine");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("all");
  const [playerFilter,  setPlayerFilter]  = useState<string>("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [showBanner,    setShowBanner]    = useState(!!newSlipId);

  const mySlips  = useMemo(() => slips.filter((s) => s.member?.user_id === currentUserId), [slips, currentUserId]);
  const allSlips = slips;

  // Unique player names for the player filter (alla tab only)
  const uniquePlayers = useMemo(() => {
    const seen = new Map<string, string>(); // user_id → display_name
    for (const s of allSlips) {
      const uid  = s.member?.user_id;
      const name = s.member?.profile?.display_name;
      if (uid && name && !seen.has(uid)) seen.set(uid, name);
    }
    return Array.from(seen.values()).sort();
  }, [allSlips]);

  // Switch tab — reset player filter so stale filter doesn't hide content
  function handleTabChange(next: Tab) {
    setTab(next);
    setPlayerFilter("all");
  }

  // Derive the base set for the current tab
  const base = tab === "mine" ? mySlips : allSlips;

  // Apply status filter
  const statusFiltered = useMemo(() => {
    if (statusFilter === "active") return base.filter((s) => s.status === "open" || s.status === "locked");
    if (statusFilter === "won")    return base.filter((s) => s.status === "won");
    if (statusFilter === "lost")   return base.filter((s) => s.status === "lost");
    if (statusFilter === "void")   return base.filter((s) => s.status === "void");
    return base; // "all" — cancelled handled separately below
  }, [base, statusFilter]);

  // Count how many of each status exist in current tab (for filter badge hints)
  const counts = useMemo<Record<StatusFilter, number>>(() => ({
    all:    base.filter((s) => s.status !== "cancelled").length,
    active: base.filter((s) => s.status === "open" || s.status === "locked").length,
    won:    base.filter((s) => s.status === "won").length,
    lost:   base.filter((s) => s.status === "lost").length,
    void:   base.filter((s) => s.status === "void").length,
  }), [base]);

  // Apply player filter (only relevant in "alla" tab)
  const playerFiltered = useMemo(() => {
    if (tab !== "all" || playerFilter === "all") return statusFiltered;
    return statusFiltered.filter((s) => s.member?.profile?.display_name === playerFilter);
  }, [statusFiltered, tab, playerFilter]);

  // Apply cancelled toggle (only when no status filter is active)
  const sorted = sortSlips(playerFiltered);
  const visible = statusFilter === "all" && !showCancelled
    ? sorted.filter((s) => s.status !== "cancelled")
    : sorted;

  const cancelledCount = statusFilter === "all"
    ? base.filter((s) => s.status === "cancelled").length
    : 0;

  // Show player filter row when in "alla" tab with 2+ distinct players
  const showPlayerFilter = tab === "all" && uniquePlayers.length >= 2;

  return (
    <div>
      {/* ── Sticky header: tabs + filters ────────────────────────────────────── */}
      <div className="sticky top-[61px] z-30 border-b border-gray-200 bg-white">

        {/* Tab row */}
        <div className="mx-auto flex max-w-lg gap-2 px-4 pt-2.5 pb-2">
          <TabButton
            label={`Mina${mySlips.length > 0 ? ` (${mySlips.length})` : ""}`}
            active={tab === "mine"}
            onClick={() => handleTabChange("mine")}
          />
          <TabButton
            label={`Alla${allSlips.length > 0 ? ` (${allSlips.length})` : ""}`}
            active={tab === "all"}
            onClick={() => handleTabChange("all")}
          />
        </div>

        {/* Status filter chips */}
        <div className="mx-auto max-w-lg px-4 pb-2 flex gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map(({ id, label }) => {
            const count = counts[id];
            const isActive = statusFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-[var(--primary)] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`ml-1.5 tabular-nums ${isActive ? "opacity-70" : "text-gray-400"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Player filter chips — only in "Alla" tab with multiple players */}
        {showPlayerFilter && (
          <div className="mx-auto max-w-lg px-4 pb-2.5 flex gap-1.5 overflow-x-auto">
            <PlayerChip
              label="Alla spelare"
              active={playerFilter === "all"}
              onClick={() => setPlayerFilter("all")}
            />
            {uniquePlayers.map((name) => (
              <PlayerChip
                key={name}
                label={name}
                active={playerFilter === name}
                onClick={() => setPlayerFilter(name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-lg px-4 py-4 space-y-3">

        {/* Success banner */}
        {showBanner && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-[var(--win-50)] px-3 py-2.5 shadow-sm">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--win)] text-[10px] font-bold text-white">✓</span>
            <span className="flex-1 text-sm font-medium text-[var(--win)]">Slip sparat</span>
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              aria-label="Stäng"
              className="text-[var(--win)] opacity-60 hover:opacity-100"
            >✕</button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState tab={tab} hasActiveFilter={statusFilter !== "all" || playerFilter !== "all"} />
        ) : (
          visible.map((slip) => (
            <SlipCard
              key={slip.id}
              slip={slip}
              showPlayer={tab === "all"}
              isOwn={slip.member?.user_id === currentUserId}
              isNew={slip.id === newSlipId}
            />
          ))
        )}

        {/* Annullerade toggle — only visible when no status filter is active */}
        {cancelledCount > 0 && (
          <button
            type="button"
            onClick={() => setShowCancelled((v) => !v)}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
          >
            {showCancelled
              ? `Dölj annullerade (${cancelledCount})`
              : `Visa annullerade (${cancelledCount})`}
          </button>
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

function PlayerChip({
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
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--primary)] bg-[var(--primary-50)] text-[var(--primary)]"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ tab, hasActiveFilter }: { tab: Tab; hasActiveFilter: boolean }) {
  if (hasActiveFilter) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-2xl">
          🔍
        </div>
        <p className="text-sm font-medium text-gray-700">Inga slip matchar filtret</p>
        <p className="mt-1 text-xs text-gray-400">Prova ett annat filter.</p>
      </div>
    );
  }
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
