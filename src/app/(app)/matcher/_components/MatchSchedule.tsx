"use client";

import { useState, useMemo } from "react";
import { MatchCard } from "./MatchCard";
import type { MatchWithTeamsAndOdds, MatchStage } from "@/types";

// ─── Types & constants ────────────────────────────────────────────────────────

type PhaseTab = "group" | "r32" | "r16" | "qf" | "sf" | "final";

interface TabDef {
  id:     PhaseTab;
  label:  string;
  stages: MatchStage[];
}

const PHASE_TABS: TabDef[] = [
  { id: "group", label: "Grupp",      stages: ["group"] },
  { id: "r32",   label: "Omg. 32",   stages: ["r32"] },
  { id: "r16",   label: "Omg. 16",   stages: ["r16"] },
  { id: "qf",    label: "QF",         stages: ["qf"] },
  { id: "sf",    label: "SF",         stages: ["sf"] },
  { id: "final", label: "Finaler",    stages: ["3rd_place", "final"] },
];

const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
type GroupLetter = typeof GROUP_LETTERS[number];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function swDateKey(utc: string): string {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  });
}

function swDateLabel(utc: string): string {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday:  "long",
    day:      "numeric",
    month:    "long",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseTabBar({
  tabs,
  counts,
  active,
  onChange,
}: {
  tabs:     TabDef[];
  counts:   Record<PhaseTab, number>;
  active:   PhaseTab;
  onChange: (t: PhaseTab) => void;
}) {
  return (
    <div className="sticky top-[57px] z-30 flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            active === tab.id
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {tab.label}
          <span className="ml-1 opacity-60">({counts[tab.id]})</span>
        </button>
      ))}
    </div>
  );
}

function GroupFilterBar({
  letters,
  active,
  onChange,
}: {
  letters:  readonly GroupLetter[];
  active:   GroupLetter | null;
  onChange: (g: GroupLetter | null) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-none">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          active === null
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        Alla
      </button>
      {letters.map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            active === g
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

function DaySectionedList({ matches }: { matches: MatchWithTeamsAndOdds[] }) {
  // Group by calendar day (Swedish time), preserving insertion order
  const days = useMemo(() => {
    const map = new Map<string, { label: string; matches: MatchWithTeamsAndOdds[] }>();
    for (const m of matches) {
      const key = swDateKey(m.scheduled_at);
      if (!map.has(key)) {
        map.set(key, { label: swDateLabel(m.scheduled_at), matches: [] });
      }
      map.get(key)!.matches.push(m);
    }
    return Array.from(map.values());
  }, [matches]);

  if (days.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-400">
        Inga matcher att visa.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {days.map(({ label, matches: dayMatches }) => (
        <section key={label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 capitalize">
            {label}
          </h2>
          <div className="space-y-2">
            {dayMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  matches: MatchWithTeamsAndOdds[];
}

export function MatchSchedule({ matches }: Props) {
  const [activeTab,    setActiveTab]    = useState<PhaseTab>("group");
  const [groupFilter,  setGroupFilter]  = useState<GroupLetter | null>(null);

  // Pre-compute counts per phase tab
  const counts = useMemo(() => {
    const c = {} as Record<PhaseTab, number>;
    for (const tab of PHASE_TABS) {
      c[tab.id] = matches.filter((m) => (tab.stages as string[]).includes(m.stage)).length;
    }
    return c;
  }, [matches]);

  // Visible matches for the active tab
  const tabStages = PHASE_TABS.find((t) => t.id === activeTab)!.stages;
  const tabMatches = useMemo(
    () => matches.filter((m) => (tabStages as string[]).includes(m.stage)),
    [matches, tabStages]
  );

  // Apply group filter (only relevant for group stage tab)
  const visibleMatches = useMemo(() => {
    if (activeTab !== "group" || groupFilter === null) return tabMatches;
    return tabMatches.filter((m) => m.group_letter === groupFilter);
  }, [activeTab, groupFilter, tabMatches]);

  // Reset group filter when changing phase tab
  function handleTabChange(tab: PhaseTab) {
    setActiveTab(tab);
    if (tab !== "group") setGroupFilter(null);
  }

  // Which group letters actually exist in the data
  const availableGroups = useMemo(() => {
    const inData = new Set(
      matches.filter((m) => m.stage === "group").map((m) => m.group_letter)
    );
    return GROUP_LETTERS.filter((g) => inData.has(g));
  }, [matches]);

  return (
    <div>
      <PhaseTabBar
        tabs={PHASE_TABS}
        counts={counts}
        active={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "group" && availableGroups.length > 0 && (
        <GroupFilterBar
          letters={availableGroups as readonly GroupLetter[]}
          active={groupFilter}
          onChange={setGroupFilter}
        />
      )}

      <div className="mx-auto max-w-lg px-4 py-4">
        {activeTab === "group" ? (
          <DaySectionedList matches={visibleMatches} />
        ) : (
          <div className="space-y-2">
            {visibleMatches.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                Inga matcher i denna fas ännu.
              </p>
            ) : (
              visibleMatches.map((m) => <MatchCard key={m.id} match={m} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
