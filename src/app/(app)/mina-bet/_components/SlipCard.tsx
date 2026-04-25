"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { deleteSlipAction } from "../actions";
import type { SlipStatus, BetStatus, BetOutcome } from "@/types";

// ─── Shared types (local to mina-bet) ────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SLIP_STATUS_CFG: Record<SlipStatus, { label: string; cls: string }> = {
  open:      { label: "Öppen",      cls: "bg-blue-100 text-blue-700" },
  locked:    { label: "Låst",       cls: "bg-amber-100 text-amber-700" },
  won:       { label: "Vann",       cls: "bg-green-100 text-green-700" },
  lost:      { label: "Förlorade",  cls: "bg-red-100 text-red-600" },
  void:      { label: "Ogiltig",    cls: "bg-gray-100 text-gray-500" },
  cancelled: { label: "Annullerad", cls: "bg-gray-100 text-gray-500" },
};

const BET_STATUS_DOT: Record<BetStatus, { cls: string; label: string } | null> = {
  open:      null,
  won:       { cls: "bg-green-500", label: "V" },
  lost:      { cls: "bg-red-400",   label: "F" },
  void:      { cls: "bg-gray-300",  label: "O" },
  cancelled: { cls: "bg-gray-300",  label: "A" },
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

function swDateTime(utc: string) {
  return new Date(utc).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function stageLabel(stage: string, groupLetter: string | null) {
  if (stage === "group" && groupLetter) return `Grupp ${groupLetter}`;
  return STAGE_LABEL[stage] ?? stage;
}

// ─── SlipCard ─────────────────────────────────────────────────────────────────

interface Props {
  slip:       SlipRow;
  showPlayer: boolean;
  isOwn:      boolean;
}

type DeleteState = "idle" | "confirming" | "error";

export function SlipCard({ slip, showPlayer, isOwn }: Props) {
  const { label: statusLabel, cls: statusCls } = SLIP_STATUS_CFG[slip.status];
  const isMulti    = slip.selections.length > 1;
  const playerName = slip.member?.profile?.display_name ?? "Okänd";

  // A slip is modifiable when it is open AND no match has started.
  // This is a client-side approximation — the server RPCs enforce the real rule.
  const isModifiable = useMemo(() => {
    if (slip.status !== "open") return false;
    const now = Date.now();
    return slip.selections.every(
      (sel) => sel.match && new Date(sel.match.scheduled_at).getTime() > now
    );
  }, [slip.status, slip.selections]);

  // ── Delete state ─────────────────────────────────────────────────────────────
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
        // On success, the page revalidates and this card disappears.
      });
    }
  }

  return (
    <article
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        isOwn ? "border-blue-200" : "border-gray-200"
      }`}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-3 py-2 ${isOwn ? "bg-blue-50" : "bg-gray-50"}`}>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls}`}>
            {statusLabel}
          </span>
          {showPlayer && (
            <span className="text-xs text-gray-600 font-medium">{playerName}</span>
          )}
          {isOwn && isModifiable && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              ändringsbar
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 tabular-nums">
          {swDateTime(slip.placed_at)}
        </span>
      </div>

      {/* ── Selections ─────────────────────────────────────────────────────── */}
      <ul className="divide-y divide-gray-100 px-3">
        {slip.selections.map((sel) => {
          const dot   = BET_STATUS_DOT[sel.status];
          const match = sel.match;
          const home  = match?.home_team;
          const away  = match?.away_team;
          const label = match ? stageLabel(match.stage, match.group_letter) : "";

          return (
            <li key={sel.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-gray-900">
                  {home?.flag_emoji} {home?.short_name ?? "?"}&nbsp;–&nbsp;
                  {away?.flag_emoji} {away?.short_name ?? "?"}
                </p>
                {label && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                  {OUTCOME_LABEL[sel.outcome]}
                </span>
                <span className="tabular-nums text-xs font-semibold text-gray-800">
                  {sel.odds_snapshot.toFixed(2)}
                </span>
                {dot && (
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${dot.cls}`}
                    title={dot.label}
                    aria-hidden
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Footer: summary ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {isMulti && (
            <span>
              Kombi{" "}
              <strong className="tabular-nums text-gray-800">
                {Number(slip.combined_odds).toFixed(2)}x
              </strong>
            </span>
          )}
          <span>
            Insats{" "}
            <strong className="tabular-nums text-gray-800">
              {slip.stake.toLocaleString("sv-SE")}
            </strong>
          </span>
        </div>

        <div className="text-right">
          {slip.status === "won" ? (
            <span className="text-sm font-bold text-green-700 tabular-nums">
              +{slip.potential_payout.toLocaleString("sv-SE")}
            </span>
          ) : slip.status === "lost" ? (
            <span className="text-sm font-bold text-red-500 tabular-nums">
              −{slip.stake.toLocaleString("sv-SE")}
            </span>
          ) : (
            <span className="text-xs text-gray-400 tabular-nums">
              Möjlig{" "}
              <strong className="text-gray-700">
                {slip.potential_payout.toLocaleString("sv-SE")}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ── Actions (only for own modifiable slips) ──────────────────────── */}
      {isOwn && isModifiable && (
        <div className="border-t border-gray-100 px-3 py-2">
          {deleteState === "error" && deleteError && (
            <p className="mb-2 text-xs text-red-600">{deleteError}</p>
          )}

          <div className="flex items-center gap-2">
            {/* Ändra — navigates to /bet?amend=<id> */}
            <Link
              href={`/bet?amend=${slip.id}`}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            >
              Ändra
            </Link>

            {/* Ta bort — two-step inline confirmation */}
            {deleteState === "idle" || deleteState === "error" ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="flex-1 rounded-lg border border-red-200 py-2 text-xs font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
              >
                Ta bort
              </button>
            ) : deleteState === "confirming" ? (
              <div className="flex flex-1 gap-1.5">
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? "Tar bort…" : "Bekräfta"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteState("idle")}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
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
