"use client";

import { useState } from "react";
import { GroupTable } from "./GroupTable";
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
  bracketMatches:  BracketMatch[];
}

export function GroupsView({ groups, finishedByGroup, totalByGroup, bracketMatches }: Props) {
  const availableLetters = ALL_LETTERS.filter((l) => l in groups);
  const [view,   setView]   = useState<View>("groups");
  const [active, setActive] = useState<GroupLetter>(availableLetters[0] ?? "A");

  const standings = groups[active] ?? [];
  const finished  = finishedByGroup[active] ?? 0;
  const total     = totalByGroup[active]    ?? 0;

  return (
    <div>
      {/* Top-level toggle: Grupper / Slutspel */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setView("groups")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            view === "groups"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Grupper
        </button>
        <button
          onClick={() => setView("bracket")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            view === "bracket"
              ? "border-b-2 border-gray-900 text-gray-900"
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
              {/* Group letter selector */}
              <div className="sticky top-[57px] z-30 border-b border-gray-200 bg-white">
                <div className="relative">
                  <div className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-none">
                    {availableLetters.map((letter) => (
                      <button
                        key={letter}
                        onClick={() => setActive(letter)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          active === letter
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                  {/* Fade gradient hinting more content to the right */}
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
                </div>
              </div>

              <div className="mx-auto max-w-lg px-4 py-4 space-y-2">
                <GroupTable letter={active} standings={standings} />
                <p className="text-center text-xs text-gray-400">
                  {finished} av {total} matcher spelade
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
