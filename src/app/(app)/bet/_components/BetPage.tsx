"use client";

import { useState, useMemo, useTransition } from "react";
import { placeSlipAction } from "../actions";
import { MatchBetCard } from "./MatchBetCard";
import { SlipPanel, type LocalSelection } from "./SlipPanel";
import type { MatchWithTeamsAndOdds, BetOutcome } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_STAKE    = 10;
const MAX_SELS     = 5;
const MIN_WALLET   = 34; // floor(34 * 0.3) = 10 = minimum stake

// ─── Date helpers ─────────────────────────────────────────────────────────────

function swDateKey(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  });
}

function swDateLabel(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday:  "long",
    day:      "numeric",
    month:    "long",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuccessResult {
  slipId:          string;
  combinedOdds:    number;
  potentialPayout: number;
}

interface OddsChangedInfo {
  matchId: string;
  newOdds: number;
}

interface Props {
  matches:     MatchWithTeamsAndOdds[];
  matchWallet: number;
}

// ─── BetPage ─────────────────────────────────────────────────────────────────

export function BetPage({ matches, matchWallet }: Props) {
  const maxStake = Math.floor(matchWallet * 0.3);
  const canBet   = matchWallet >= MIN_WALLET;

  // ── State ───────────────────────────────────────────────────────────────────
  const [selections,      setSelections]     = useState<LocalSelection[]>([]);
  const [stake,           setStake]          = useState<string>(
    String(Math.min(50, maxStake > 0 ? maxStake : 10))
  );
  const [panelOpen,       setPanelOpen]      = useState(false);
  const [isPending,       startTransition]   = useTransition();
  const [errorMsg,        setErrorMsg]       = useState<string | null>(null);
  const [oddsChangedInfo, setOddsChanged]    = useState<OddsChangedInfo | null>(null);
  const [successResult,   setSuccessResult]  = useState<SuccessResult | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Only show matches that haven't started yet (client-side time check as UX aid;
  // the RPC will re-validate server-side)
  const pageLoadTime = useMemo(() => Date.now(), []);
  const upcomingMatches = useMemo(
    () => matches.filter((m) => new Date(m.scheduled_at).getTime() > pageLoadTime),
    [matches, pageLoadTime]
  );

  // Group by Swedish calendar day, preserving chronological order
  const dayGroups = useMemo(() => {
    const map = new Map<string, { label: string; matches: MatchWithTeamsAndOdds[] }>();
    for (const m of upcomingMatches) {
      const key = swDateKey(m.scheduled_at);
      if (!map.has(key)) map.set(key, { label: swDateLabel(m.scheduled_at), matches: [] });
      map.get(key)!.matches.push(m);
    }
    return Array.from(map.values());
  }, [upcomingMatches]);

  // Quick lookup: matchId → match (for the slip panel to render team names)
  const matchMap = useMemo(() => {
    const m = new Map<string, MatchWithTeamsAndOdds>();
    for (const match of matches) m.set(match.id, match);
    return m;
  }, [matches]);

  const combinedOdds = useMemo(
    () => selections.reduce((acc, s) => acc * s.oddsSnapshot, 1),
    [selections]
  );

  const stakeNum = useMemo(() => {
    const n = parseInt(stake, 10);
    return isNaN(n) ? 0 : n;
  }, [stake]);

  const potentialPayout = useMemo(
    () => (stakeNum >= MIN_STAKE && stakeNum <= maxStake ? Math.floor(stakeNum * combinedOdds) : 0),
    [stakeNum, combinedOdds, maxStake]
  );

  const stakeError = useMemo(() => {
    if (stakeNum < MIN_STAKE) return `Minst ${MIN_STAKE} coins`;
    if (stakeNum > maxStake) return `Max ${maxStake.toLocaleString("sv-SE")} coins`;
    return null;
  }, [stakeNum, maxStake]);

  const canSubmit =
    selections.length >= 1 &&
    stakeNum >= MIN_STAKE &&
    stakeNum <= maxStake &&
    !isPending;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleToggle(matchId: string, outcome: BetOutcome, oddsSnapshot: number) {
    setErrorMsg(null);
    setOddsChanged(null);
    setSuccessResult(null);

    setSelections((prev) => {
      const existing = prev.find((s) => s.matchId === matchId);

      if (existing) {
        if (existing.outcome === outcome) {
          // Deselect
          const next = prev.filter((s) => s.matchId !== matchId);
          if (next.length === 0) setPanelOpen(false);
          return next;
        }
        // Switch outcome for this match
        return prev.map((s) =>
          s.matchId === matchId ? { matchId, outcome, oddsSnapshot } : s
        );
      }

      if (prev.length >= MAX_SELS) return prev;
      const next = [...prev, { matchId, outcome, oddsSnapshot }];
      if (next.length === 1) setPanelOpen(true); // auto-open slip on first pick
      return next;
    });
  }

  function handleRemove(matchId: string) {
    setSelections((prev) => {
      const next = prev.filter((s) => s.matchId !== matchId);
      if (next.length === 0) setPanelOpen(false);
      return next;
    });
  }

  function handleClear() {
    setSelections([]);
    setOddsChanged(null);
    setErrorMsg(null);
    setSuccessResult(null);
    setPanelOpen(false);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setErrorMsg(null);

    startTransition(async () => {
      const result = await placeSlipAction(selections, stakeNum);

      if (result.ok) {
        setSuccessResult({
          slipId:          result.slipId,
          combinedOdds:    result.combinedOdds,
          potentialPayout: result.potentialPayout,
        });
        setSelections([]);
        setStake(String(Math.min(50, maxStake)));
        setOddsChanged(null);
        setPanelOpen(false);
      } else if (
        !result.ok &&
        result.code === "odds_changed" &&
        result.matchId !== undefined &&
        result.currentOdds !== undefined
      ) {
        const { matchId, currentOdds } = result;
        // Update the stored odds snapshot so the next submit uses the new value
        setSelections((prev) =>
          prev.map((s) =>
            s.matchId === matchId ? { ...s, oddsSnapshot: currentOdds } : s
          )
        );
        setOddsChanged({ matchId, newOdds: currentOdds });
      } else if (!result.ok) {
        setErrorMsg(result.error);
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const showPanel = selections.length > 0;

  return (
    // Extra bottom padding so content never hides behind the fixed slip panel
    <div className={showPanel ? "pb-28" : "pb-6"}>

      {/* ── Wallet info bar ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-lg px-4 py-3">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            Saldo:{" "}
            <strong className="text-gray-900">
              {matchWallet.toLocaleString("sv-SE")} coins
            </strong>
          </span>
          <span className="text-gray-200">|</span>
          <span>
            Max insats:{" "}
            <strong className={canBet ? "text-gray-900" : "text-red-500"}>
              {maxStake.toLocaleString("sv-SE")} coins
            </strong>
          </span>
        </div>

        {!canBet && (
          <p className="mt-1 text-xs text-red-500">
            Du behöver minst {MIN_WALLET} coins för att lägga ett slip.
          </p>
        )}
      </div>

      {/* ── Success banner ───────────────────────────────────────────────── */}
      {successResult && (
        <div className="mx-auto max-w-lg px-4 pb-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-800">Slipet är placerat!</p>
            <p className="mt-1 text-xs text-green-700">
              Möjlig vinst:{" "}
              <strong>{successResult.potentialPayout.toLocaleString("sv-SE")} coins</strong>
              {" "}· Odds: {successResult.combinedOdds.toFixed(2)}x
            </p>
            <button
              type="button"
              onClick={() => setSuccessResult(null)}
              className="mt-2 text-xs text-green-700 underline"
            >
              Stäng
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {upcomingMatches.length === 0 && (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-gray-400">
            Inga kommande matcher att spela på just nu.
          </p>
        </div>
      )}

      {/* ── Match list grouped by day ─────────────────────────────────────── */}
      <div className="mx-auto max-w-lg px-4 space-y-6">
        {dayGroups.map(({ label, matches: dayMatches }) => (
          <section key={label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 first-letter:capitalize">
              {label}
            </h2>
            <ul className="space-y-2">
              {dayMatches.map((m) => (
                <li key={m.id}>
                  <MatchBetCard
                    match={m}
                    selectedOutcome={
                      selections.find((s) => s.matchId === m.id)?.outcome ?? null
                    }
                    onToggle={handleToggle}
                    isMaxed={selections.length >= MAX_SELS}
                    oddsChangedMatchId={oddsChangedInfo?.matchId ?? null}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* ── Slip panel ───────────────────────────────────────────────────── */}
      {showPanel && (
        <SlipPanel
          selections={selections}
          matchMap={matchMap}
          stake={stake}
          maxStake={maxStake}
          stakeError={stakeError}
          combinedOdds={combinedOdds}
          potentialPayout={potentialPayout}
          canSubmit={canSubmit}
          isPending={isPending}
          errorMsg={errorMsg}
          oddsChangedInfo={oddsChangedInfo}
          isOpen={panelOpen}
          onToggleOpen={() => setPanelOpen((o) => !o)}
          onStakeChange={setStake}
          onRemoveSelection={handleRemove}
          onClear={handleClear}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
