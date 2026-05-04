"use client";

import { useState, useTransition } from "react";
import { settleMatchAction } from "../actions";
import type { SettleMatchResult } from "@/lib/betting/settle-match";
import type { MatchWithTeams } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OUTCOME_LABEL: Record<string, string> = {
  home: "Hemma vinner",
  draw: "Oavgjort",
  away: "Borta vinner",
};

function swDate(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short",
  });
}

function matchLabel(m: MatchWithTeams): string {
  const home = m.home_team ? `${m.home_team.flag_emoji ?? ""} ${m.home_team.short_name}` : "?";
  const away = m.away_team ? `${m.away_team.flag_emoji ?? ""} ${m.away_team.short_name}` : "?";
  const score =
    m.home_score !== null && m.away_score !== null
      ? ` ${m.home_score}–${m.away_score}`
      : "";
  const tag = m.status === "void" ? " (VOID)" : "";
  return `#${m.match_number} · ${home} – ${away}${score}${tag} · ${swDate(m.scheduled_at)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  matches: MatchWithTeams[]; // finished + void matches passed from server
}

// ─── SettlePanel ─────────────────────────────────────────────────────────────

export function SettlePanel({ matches }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [result,     setResult]     = useState<SettleMatchResult | null>(null);
  const [isPending,  startTransition] = useTransition();

  function handleSettle() {
    if (!selectedId || isPending) return;
    setResult(null);
    startTransition(async () => {
      const r = await settleMatchAction(selectedId);
      setResult(r);
    });
  }

  if (matches.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-500">2</span>
          <h2 className="text-base font-semibold text-gray-400">Avgör slip</h2>
        </div>
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-400">
            Inga avslutade matcher ännu. Sätt ett resultat i <strong>Steg 1</strong> ovan — sedan aktiveras settlement här.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">2</span>
        <h2 className="text-base font-semibold text-gray-900">Avgör slip</h2>
      </div>
      <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-50)]/40 p-4 space-y-4">
        <p className="text-xs text-gray-600">
          Välj en avslutad match för att avgöra alla slip som innehåller den matchen.
          Idempotent — kan köras flera gånger utan dubbelutbetalning.
        </p>

        {/* Match selector */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="settle-match">
            Match
          </label>
          <select
            id="settle-match"
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setResult(null); }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">Välj match…</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {matchLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Trigger button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSettle}
            disabled={!selectedId || isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
          >
            {isPending ? "Avgör…" : "Avgör slip"}
          </button>

          {/* Inline result */}
          {result && <SettleResultBadge result={result} />}
        </div>

        {/* Detailed result */}
        {result?.ok && <SettleResultDetail result={result} />}
      </div>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettleResultBadge({ result }: { result: SettleMatchResult }) {
  if (!result.ok) {
    return <p className="text-sm text-[var(--loss)]">{result.error}</p>;
  }
  const total = result.slipsWon + result.slipsLost + result.slipsVoid;
  return (
    <p className="text-sm text-[var(--win)]">
      {total === 0 ? "Inga öppna slip att avgöra." : `${total} slip avgjorda.`}
    </p>
  );
}

function SettleResultDetail({ result }: { result: Extract<SettleMatchResult, { ok: true }> }) {
  const { outcome, selectionsSettled, slipsWon, slipsLost, slipsVoid, totalPayout } = result;
  const total = slipsWon + slipsLost + slipsVoid;
  if (total === 0 && selectionsSettled === 0) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 space-y-1 text-xs text-gray-600">
      {outcome && (
        <p>Utfall: <strong className="text-gray-900">{OUTCOME_LABEL[outcome] ?? outcome}</strong></p>
      )}
      {selectionsSettled > 0 && (
        <p>Selections avgjorda: <strong>{selectionsSettled}</strong></p>
      )}
      {total > 0 && (
        <div className="flex gap-4">
          {slipsWon  > 0 && <span className="text-[var(--win)]">✓ {slipsWon} vann</span>}
          {slipsLost > 0 && <span className="text-[var(--loss)]">✗ {slipsLost} förlorade</span>}
          {slipsVoid > 0 && <span className="text-gray-500">○ {slipsVoid} ogiltigförklarade</span>}
        </div>
      )}
      {totalPayout > 0 && (
        <p>Totalt utbetalt: <strong className="text-[var(--win)]">{totalPayout.toLocaleString("sv-SE")} coins</strong></p>
      )}
    </div>
  );
}
