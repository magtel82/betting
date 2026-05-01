"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { placeSlipAction, amendSlipAction } from "../actions";
import { MatchBetCard } from "./MatchBetCard";
import { SlipPanel, type LocalSelection } from "./SlipPanel";
import type { MatchWithTeamsAndOdds, BetOutcome } from "@/types";

const SESSION_KEY = "betSlipSelections";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_STAKE  = 10;
const MAX_SELS   = 5;
const MIN_WALLET = 34; // floor(34 * 0.3) = 10 = minimum stake

// ─── Date helpers ─────────────────────────────────────────────────────────────

function swDateKey(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

function swDateLabel(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "long", day: "numeric", month: "long",
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuccessResult {
  slipId:          string;
  combinedOdds:    number;
  potentialPayout: number;
  wasAmend:        boolean;
}

interface OddsChangedInfo {
  matchId: string;
  newOdds: number;
}

interface Props {
  matches:             MatchWithTeamsAndOdds[];
  matchWallet:         number;
  amendSlipId?:        string;       // set when navigated from /mina-bet with ?amend=<id>
  prefilledSelections?:LocalSelection[]; // old slip's selections mapped to current odds
  prefilledStake?:     number;       // old slip's stake (as starting value)
}

// ─── BetPage ─────────────────────────────────────────────────────────────────

export function BetPage({
  matches,
  matchWallet,
  amendSlipId,
  prefilledSelections,
  prefilledStake,
}: Props) {
  // isAmendMode tracks whether we're still amending a specific old slip.
  // Cleared on success so subsequent submits create fresh slips.
  const [isAmendMode,    setIsAmendMode]   = useState(!!amendSlipId);
  const activeAmendId = isAmendMode ? amendSlipId : undefined;

  // Ref used in effects to access the prop without re-running effects
  const amendSlipIdRef = useRef(amendSlipId);

  // For amend mode: the old stake will be refunded, increasing effective balance.
  const amendRefund = isAmendMode ? (prefilledStake ?? 0) : 0;
  const effectiveWallet = matchWallet + amendRefund;
  const maxStake = Math.floor(effectiveWallet * 0.3);
  const canBet   = effectiveWallet >= MIN_WALLET;

  // ── State ───────────────────────────────────────────────────────────────────
  const [selections,      setSelections]   = useState<LocalSelection[]>(
    prefilledSelections ?? []
  );
  const [stake,           setStake]        = useState<string>(
    String(Math.min(prefilledStake ?? 50, maxStake > 0 ? maxStake : 10))
  );
  const [panelOpen,       setPanelOpen]    = useState(
    (prefilledSelections?.length ?? 0) > 0  // auto-open if pre-filled
  );
  const [isPending,       startTransition] = useTransition();
  const [errorMsg,        setErrorMsg]     = useState<string | null>(null);
  const [oddsChangedInfo, setOddsChanged]  = useState<OddsChangedInfo | null>(null);
  const [successResult,   setSuccessResult]= useState<SuccessResult | null>(null);

  // ── sessionStorage persistence ──────────────────────────────────────────────
  // Restore selections when the user navigates back to /bet within the same
  // browser session. Amend-mode uses prefilledSelections and skips this.

  useEffect(() => {
    if (amendSlipIdRef.current) return; // amend prefill takes precedence
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed: LocalSelection[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setSelections(parsed);
        setPanelOpen(true);
      }
    } catch {
      // Ignore parse errors — stale data is discarded
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAmendMode) return; // Don't persist amend selections to session
    try {
      if (selections.length > 0) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(selections));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // sessionStorage may be unavailable in some private-mode browsers
    }
  }, [selections, isAmendMode]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const pageLoadTime = useMemo(() => Date.now(), []);
  const upcomingMatches = useMemo(
    () => matches.filter((m) => new Date(m.scheduled_at).getTime() > pageLoadTime),
    [matches, pageLoadTime]
  );

  const dayGroups = useMemo(() => {
    const map = new Map<string, { label: string; matches: MatchWithTeamsAndOdds[] }>();
    for (const m of upcomingMatches) {
      const key = swDateKey(m.scheduled_at);
      if (!map.has(key)) map.set(key, { label: swDateLabel(m.scheduled_at), matches: [] });
      map.get(key)!.matches.push(m);
    }
    return Array.from(map.values());
  }, [upcomingMatches]);

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

    const existing = selections.find((s) => s.matchId === matchId);

    if (existing?.outcome === outcome) {
      const next = selections.filter((s) => s.matchId !== matchId);
      setSelections(next);
      if (next.length === 0) setPanelOpen(false);
      return;
    }

    if (existing) {
      setSelections(selections.map((s) =>
        s.matchId === matchId ? { matchId, outcome, oddsSnapshot } : s
      ));
      return;
    }

    if (selections.length >= MAX_SELS) return;

    const next = [...selections, { matchId, outcome, oddsSnapshot }];
    setSelections(next);
  }

  function handleRemove(matchId: string) {
    const next = selections.filter((s) => s.matchId !== matchId);
    setSelections(next);
    if (next.length === 0) setPanelOpen(false);
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
      const result = activeAmendId
        ? await amendSlipAction(activeAmendId, selections, stakeNum)
        : await placeSlipAction(selections, stakeNum);

      if (result.ok) {
        setSuccessResult({
          slipId:          result.slipId,
          combinedOdds:    result.combinedOdds,
          potentialPayout: result.potentialPayout,
          wasAmend:        !!activeAmendId,
        });
        setSelections([]);
        setStake(String(Math.min(50, Math.floor(matchWallet * 0.3))));
        setOddsChanged(null);
        setIsAmendMode(false); // done amending — next submit is a fresh placement
        setPanelOpen(false);
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      } else if (
        !result.ok &&
        result.code === "odds_changed" &&
        result.matchId !== undefined &&
        result.currentOdds !== undefined
      ) {
        // All validation ran before any writes: old slip is still intact.
        // Update the snapshot so the next submit uses the confirmed odds.
        const { matchId, currentOdds } = result;
        setSelections((prev) =>
          prev.map((s) => s.matchId === matchId ? { ...s, oddsSnapshot: currentOdds } : s)
        );
        setOddsChanged({ matchId, newOdds: currentOdds });
      } else if (!result.ok) {
        setErrorMsg(result.error);
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const showPanel = selections.length > 0;

  const slipPanelProps = {
    selections,
    matchMap,
    stake,
    maxStake,
    stakeError,
    combinedOdds,
    potentialPayout,
    canSubmit,
    isPending,
    errorMsg,
    oddsChangedInfo,
    isOpen: panelOpen,
    isAmendMode,
    onToggleOpen: () => setPanelOpen((o) => !o),
    onStakeChange: setStake,
    onRemoveSelection: handleRemove,
    onClear: handleClear,
    onSubmit: handleSubmit,
  };

  return (
    <div className={
      !showPanel ? "pb-6" :
      panelOpen  ? "pb-[74vh] lg:pb-6" :
                   "pb-28 lg:pb-6"
    }>
      <div className="mx-auto max-w-[480px] px-4 lg:max-w-[900px]">
        <div className="lg:flex lg:gap-8 lg:items-start">

          {/* ── Left column ────────────────────────────────────────────── */}
          <div className="min-w-0 lg:flex-[3]">

            {/* Amend mode banner */}
            {isAmendMode && !successResult && (
              <div className="pt-3 pb-1">
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <span className="mt-px shrink-0 text-amber-500">✎</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-800">Du ändrar ett slip</p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      Det gamla slipet annulleras och insatsen återbetalas när du skickar det nya.
                      Välj matcherna du vill ha, justera insatsen och tryck Ändra slip.
                    </p>
                  </div>
                  <Link
                    href="/mina-bet"
                    className="ml-auto shrink-0 text-xs text-amber-600 underline"
                  >
                    Avbryt
                  </Link>
                </div>
              </div>
            )}

            {/* Wallet info */}
            <div className="py-3">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Saldo:{" "}
                  <strong className="text-gray-900">
                    {matchWallet.toLocaleString("sv-SE")} coins
                  </strong>
                </span>
                {isAmendMode && amendRefund > 0 && (
                  <>
                    <span className="text-gray-200">+</span>
                    <span className="text-amber-600">
                      återbetalas{" "}
                      <strong>{amendRefund.toLocaleString("sv-SE")}</strong>
                    </span>
                  </>
                )}
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

            {/* Instruction */}
            <div className="pb-3">
              <p className="text-xs text-gray-400">
                Välj 1–5 matcher · max 30% av saldo per slip
              </p>
            </div>

            {/* Success banner */}
            {successResult && (
              <div className="pb-3">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-semibold text-green-800">
                    {successResult.wasAmend ? "Slipet är ändrat!" : "Slipet är placerat!"}
                  </p>
                  <p className="mt-1 text-xs text-green-700">
                    Möjlig vinst:{" "}
                    <strong>{successResult.potentialPayout.toLocaleString("sv-SE")} coins</strong>
                    {" "}· Odds: {successResult.combinedOdds.toFixed(2)}x
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSuccessResult(null)}
                      className="text-xs text-green-700 underline"
                    >
                      Stäng
                    </button>
                    <Link href="/mina-bet" className="text-xs text-green-700 underline">
                      Se dina slip →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {upcomingMatches.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm text-gray-400">
                  Inga kommande matcher att spela på just nu.
                </p>
              </div>
            )}

            {/* Match list grouped by day */}
            <div className="space-y-6">
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
          </div>

          {/* ── Right column: desktop slip panel ───────────────────────── */}
          {showPanel && (
            <div className="hidden lg:block lg:flex-[2] lg:sticky lg:top-[57px] lg:pt-3">
              <SlipPanel {...slipPanelProps} isSidebar />
            </div>
          )}

        </div>
      </div>

      {/* Mobile drawer */}
      {showPanel && (
        <div className="lg:hidden">
          <SlipPanel {...slipPanelProps} />
        </div>
      )}
    </div>
  );
}
