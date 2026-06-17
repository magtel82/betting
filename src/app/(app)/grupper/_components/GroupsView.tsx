"use client";

import { useState } from "react";
import { GroupTable } from "./GroupTable";
import { GroupMatches, type GroupMatch } from "./GroupMatches";
import { BracketView } from "./BracketView";
import type { TeamStanding } from "@/lib/group-standings";
import type { BracketMatch } from "@/lib/knockout-bracket";

const ALL_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
type GroupLetter = typeof ALL_LETTERS[number];
type View = "groups" | "bracket";

interface Props {
  groups:          Record<string, TeamStanding[]>;
  finishedByGroup: Record<string, number>;
  totalByGroup:    Record<string, number>;
  matchesByGroup:  Record<string, GroupMatch[]>;
  bracketMatches:  BracketMatch[];
}

export function GroupsView({ groups, finishedByGroup, totalByGroup, matchesByGroup, bracketMatches }: Props) {
  const availableLetters = ALL_LETTERS.filter((l) => l in groups);
  const [view,    setView]    = useState<View>("groups");
  const [active,  setActive]  = useState<GroupLetter>(availableLetters[0] ?? "A");
  const [showAll, setShowAll] = useState(false);

  const standings = groups[active] ?? [];
  const finished  = finishedByGroup[active] ?? 0;
  const total     = totalByGroup[active]    ?? 0;

  return (
    <div>
      {/* Top-level toggle: Grupper / Slutspel */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setView("groups")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            view === "groups"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Grupper
        </button>
        <button
          onClick={() => setView("bracket")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            view === "bracket"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Slutspel
        </button>
      </div>

      {view === "bracket" ? (
        <BracketView matches={bracketMatches} />
      ) : (
        <>
          {availableLetters.length === 0 ? (
            <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-gray-400">
              Inga gruppspelsdata tillgänglig än.
            </div>
          ) : (
            <>
              {/* Group letter selector + Visa alla toggle */}
              <div className="sticky top-[61px] z-30 border-b border-gray-200 bg-white">
                <div className="flex flex-wrap gap-1.5 px-4 py-2">
                  {availableLetters.map((letter) => (
                    <button
                      key={letter}
                      onClick={() => { setActive(letter); setShowAll(false); }}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-medium transition-colors ${
                        !showAll && active === letter
                          ? "bg-[var(--primary)] text-white shadow-sm"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className={`flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${
                      showAll
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    Alla
                  </button>
                </div>
              </div>

              {showAll ? (
                /* ── Alla grupper: 1 kolumn mobil, 3 kolumner desktop ── */
                <div className="mx-auto w-full px-4 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {availableLetters.map((letter) => (
                      <div key={letter} className="space-y-2">
                        <GroupTable
                          letter={letter}
                          standings={groups[letter] ?? []}
                        />
                        <p className="text-center text-xs text-gray-400">
                          {finishedByGroup[letter] ?? 0} av {totalByGroup[letter] ?? 0} matcher
                        </p>
                        <GroupMatches matches={matchesByGroup[letter] ?? []} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Enskild grupp ── */
                <div className="mx-auto max-w-lg px-4 py-4 space-y-2">
                  <GroupTable letter={active} standings={standings} />
                  <p className="text-center text-xs text-gray-400">
                    {finished} av {total} matcher spelade
                  </p>
                  <h3 className="pt-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Matcher
                  </h3>
                  <GroupMatches matches={matchesByGroup[active] ?? []} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
