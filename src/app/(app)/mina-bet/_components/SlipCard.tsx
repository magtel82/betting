"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { deleteSlipAction } from "../actions";
import type { SlipStatus, BetStatus, BetOutcome } from "@/types";
import { FlagIcon } from "@/components/FlagIcon";

export interface SelectionRow {
  id:            string;
  outcome:       BetOutcome;
  odds_snapshot: number;
  status:        BetStatus;
  match: {
    id:           string;
    match_number: number;
    stage:        string;
    group_letter: string | null;
    scheduled_at: string;
    home_team:    { short_name: string; flag_emoji: string | null } | null;
    away_team:    { short_name: string; flag_emoji: string | null } | null;
  } | null;
}

export interface SlipRow {
  id:               string;
  league_member_id: string;
  stake:            number;
  combined_odds:    number;
  potential_payout: number;
  status:           SlipStatus;
  placed_at:        string;
  locked_at:        string | null;
  settled_at:       string | null;
  member: {
    user_id: string;
    profile:  { display_name: string } | null;
  } | null;
  selections: SelectionRow[];
}

const SLIP_STATUS_CFG: Record<SlipStatus, { label: string; cls: string }> = {
  open:      { label: "Öppen",      cls: "bg-[var(--primary-50)] text-[var(--primary)]" },
  locked:    { label: "Låst",       cls: "bg-amber-100 text-amber-700" },
  won:       { label: "Vunnen",     cls: "bg-[var(--win-50)] text-[var(--win)]" },
  lost:      { label: "Förlorad",   cls: "bg-[var(--loss-50)] text-[var(--loss)]" },
  void:      { label: "Ogiltig",    cls: "bg-gray-100 text-gray-500" },
  cancelled: { label: "Annullerad", cls: "bg-gray-100 text-gray-500" },
};

const BET_STATUS_DOT: Record<BetStatus, { cls: string; label: string } | null> = {
  open:      null,
  won:       { cls: "bg-[var(--win)]",     label: "✓" },
  lost:      { cls: "bg-[var(--loss)]",    label: "✕" },
  void:      { cls: "bg-gray-300",         label: "−" },
  cancelled: { cls: "bg-gray-300",         label: "−" },
};

const OUTCOME_LABEL: Record<BetOutcome, string> = {
  home: "H",
  draw: "X",
  away: "B",
};

const STAGE_LABEL: Record<string, string> = {
  group: "Grupp", r32: "Omg. 32", r16: "Omg. 16",
  qf: "QF", sf: "SF", "3rd_place": "Bronsmatch", final: "Final",
};

const COMBO_LABEL: Record<number, string> = {
  1: "Singel",
  2: "Dubbel",
  3: "Trippel",
  4: "Fyrfaldare",
  5: "Femfaldare",
};

function swDate(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
  });
}

function matchDateRange(selections: SelectionRow[]): string {
  const timestamps = selections
    .map((s) => s.match?.scheduled_at)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());

  if (timestamps.length === 0) return "";

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const minStr = swDate(new Date(minTs).toISOString());
  const maxStr = swDate(new Date(maxTs).toISOString());

  return minStr === maxStr ? minStr : `${minStr}–${maxStr}`;
}

function stageLabel(stage: string, groupLetter: string | null) {
  if (stage === "group" && groupLetter) return `Grupp ${groupLetter}`;
  return STAGE_LABEL[stage] ?? stage;
}

interface Props {
  slip:       SlipRow;
  showPlayer: boolean;
  isOwn:      boolean;
  isNew?:     boolean;
}

type DeleteState = "idle" | "confirming" | "error";

export function SlipCard({ slip, showPlayer, isOwn, isNew = false }: Props) {
  const { label: statusLabel, cls: statusCls } = SLIP_STATUS_CFG[slip.status];
  const isMulti     = slip.selections.length > 1;
  const comboLabel  = COMBO_LABEL[slip.selections.length] ?? `${slip.selections.length}-vägs`;
  const playerName  = slip.member?.profile?.display_name ?? "Okänd";
  const isCancelled = slip.status === "cancelled";

  const isModifiable = useMemo(() => {
    if (slip.status !== "open") return false;
    const now = Date.now();
    return slip.selections.every(
      (sel) => sel.match && new Date(sel.match.scheduled_at).getTime() > now
    );
  }, [slip.status, slip.selections]);

  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending,   startTransition] = useTransition();

  function handleDeleteClick() {
    if (deleteState === "idle") {
      setDeleteState("confirming");
      return;
    }
    if (deleteState === "confirming") {
      startTransition(async () => {
        const result = await deleteSlipAction(slip.id);
        if (!result.ok) {
          setDeleteError(result.error);
          setDeleteState("error");
        }
      });
    }
  }

  return (
    <article
      className={`overflow-hidden rounded-xl border shadow-sm ${
        isCancelled
          ? "border-gray-200 bg-gray-50 opacity-70"
          : isNew
            ? "bg-white border-[var(--win)]/40 ring-1 ring-[var(--win)]/20"
            : `bg-white ${isOwn ? "border-[var(--primary)]/30" : "border-gray-200"}`
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${isCancelled ? "bg-gray-100" : isOwn ? "bg-[var(--primary-50)]" : "bg-gray-50"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>
            {statusLabel}
          </span>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            {comboLabel}
          </span>
          {showPlayer && (
            <span className="truncate text-xs font-semibold text-gray-700">{playerName}</span>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-500 tabular-nums">
          {matchDateRange(slip.selections)}
        </span>
      </div>

      {/* Selections */}
      <ul className="divide-y divide-gray-100 px-3">
        {slip.selections.map((sel) => {
          const dot   = BET_STATUS_DOT[sel.status];
          const match = sel.match;
          const home  = match?.home_team;
          const away  = match?.away_team;
          const label = match ? stageLabel(match.stage, match.group_letter) : "";

          return (
            <li key={sel.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                {isCancelled && (!home || !away) ? (
                  <p className="truncate text-sm font-medium text-gray-400 italic">Ogiltigt slip</p>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold text-gray-900">
                      <FlagIcon code={home?.short_name ?? ""} className="text-base" /> {home?.short_name ?? "?"}
                      <span className="mx-1 text-gray-300">–</span>
                      <FlagIcon code={away?.short_name ?? ""} className="text-base" /> {away?.short_name ?? "?"}
                    </p>
                    {label && (
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
                    )}
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                  {OUTCOME_LABEL[sel.outcome]}
                </span>
                <span className="tabular-nums text-xs font-bold text-gray-900">
                  {sel.odds_snapshot.toFixed(2)}
                </span>
                {dot && (
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${dot.cls}`}
                    title={dot.label}
                  >
                    {dot.label}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer: summary */}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {isMulti && (
            <span>
              Kombi{" "}
              <strong className="tabular-nums text-gray-900">
                {Number(slip.combined_odds).toFixed(2)}x
              </strong>
            </span>
          )}
          <span>
            Insats{" "}
            <strong className="tabular-nums text-gray-900">
              {slip.stake.toLocaleString("sv-SE")}
            </strong>
          </span>
        </div>

        <div className="text-right">
          {slip.status === "won" ? (
            <span className="text-base font-bold text-[var(--win)] tabular-nums">
              +{slip.potential_payout.toLocaleString("sv-SE")} 🪙
            </span>
          ) : slip.status === "lost" ? (
            <span className="text-base font-bold text-[var(--loss)] tabular-nums">
              −{slip.stake.toLocaleString("sv-SE")} 🪙
            </span>
          ) : (
            <span className="text-xs text-gray-500 tabular-nums">
              Möjlig{" "}
              <strong className="text-[var(--win)]">
                {slip.potential_payout.toLocaleString("sv-SE")}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Locked notice — open but not editable (match started) */}
      {isOwn && slip.status === "open" && !isModifiable && (
        <div className="border-t border-gray-100 px-3 py-2">
          <p className="text-xs text-gray-400">Låst — en eller flera matcher har startat</p>
        </div>
      )}

      {/* Actions */}
      {isOwn && isModifiable && (
        <div className="border-t border-gray-100 px-3 py-2">
          {deleteState === "error" && deleteError && (
            <p className="mb-2 text-xs font-medium text-[var(--loss)]">{deleteError}</p>
          )}

          <div className="flex items-center gap-2">
            <Link
              href={`/bet?amend=${slip.id}`}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
            >
              Ändra
            </Link>

            {deleteState === "idle" || deleteState === "error" ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="h-10 flex-1 rounded-lg border border-red-200 text-xs font-semibold text-[var(--loss)] hover:bg-[var(--loss-50)] active:bg-red-100"
              >
                Ta bort
              </button>
            ) : deleteState === "confirming" ? (
              <div className="flex flex-1 gap-1.5">
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isPending}
                  className="h-10 flex-1 rounded-lg bg-[var(--loss)] text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? "Tar bort…" : "Bekräfta"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteState("idle")}
                  className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Avbryt
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}
