"use client";

import { useState } from "react";
import { GroupTable } from "./GroupTable";
import type { TeamStanding } from "@/lib/group-standings";

const ALL_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
type GroupLetter = typeof ALL_LETTERS[number];

interface Props {
  groups:          Record<string, TeamStanding[]>;
  finishedByGroup: Record<string, number>;
  totalByGroup:    Record<string, number>;
}

export function GroupsView({ groups, finishedByGroup, totalByGroup }: Props) {
  const availableLetters = ALL_LETTERS.filter((l) => l in groups);
  const [active, setActive] = useState<GroupLetter>(availableLetters[0] ?? "A");

  const standings = groups[active] ?? [];

  const finished = finishedByGroup[active] ?? 0;
  const total    = totalByGroup[active]    ?? 0;

  if (availableLetters.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-gray-400">
        Inga gruppspelsdata tillgänglig än.
      </div>
    );
  }

  return (
    <div>
      {/* Group selector */}
      <div className="sticky top-[57px] z-30 flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 scrollbar-none">
        {availableLetters.map((letter) => (
          <button
            key={letter}
            onClick={() => setActive(letter)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active === letter
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-lg px-4 py-4 space-y-2">
        <GroupTable letter={active} standings={standings} />

        {/* Match count footer */}
        <p className="text-center text-xs text-gray-400">
          {finished} av {total} matcher spelade
        </p>
      </div>
    </div>
  );
}
