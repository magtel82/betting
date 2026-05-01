"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setSpecialOddsAction } from "../actions";
import type { SpecialMarket } from "@/types";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Sparar…" : "Spara odds"}
    </button>
  );
}

function Feedback({ state }: { state: { error?: string; success?: string } | null }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-[var(--loss)]">{state.error}</p>;
  return <p className="text-sm text-[var(--win)]">{state.success}</p>;
}

// ─── MarketOddsRow ────────────────────────────────────────────────────────────
// One row per odds-based market (vm_vinnare / skyttekung).

function MarketOddsRow({
  type,
  label,
  tournamentId,
  currentOdds,
  updatedAt,
}: {
  type:         "vm_vinnare" | "skyttekung";
  label:        string;
  tournamentId: string;
  currentOdds:  number | null;
  updatedAt:    string | null;
}) {
  const [state, action] = useActionState(setSpecialOddsAction, null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {currentOdds !== null ? (
          <span className="rounded-full bg-[var(--primary-50)] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">
            Nuv. odds: {currentOdds.toFixed(2)}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
            Ej satt
          </span>
        )}
      </div>

      {updatedAt && (
        <p className="text-[11px] text-gray-400">
          Senast ändrat:{" "}
          {new Date(updatedAt).toLocaleString("sv-SE", {
            timeZone: "Europe/Stockholm",
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </p>
      )}

      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="market_type"   value={type} />
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input
          type="number"
          name="odds"
          step="0.01"
          min="1.01"
          placeholder={currentOdds ? String(currentOdds) : "t.ex. 5.50"}
          className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          aria-label={`Odds för ${label}`}
        />
        <SubmitButton />
        <Feedback state={state} />
      </form>
    </div>
  );
}

// ─── SpecialOddsForm ──────────────────────────────────────────────────────────

interface Props {
  tournamentId: string;
  markets:      SpecialMarket[];
}

export function SpecialOddsForm({ tournamentId, markets }: Props) {
  const byType = new Map(markets.map((m) => [m.type, m]));
  const vmMkt   = byType.get("vm_vinnare");
  const skyttMkt = byType.get("skyttekung");

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Specialbet-odds</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <p className="text-xs text-gray-500">
          Sätt odds för specialmarknader. Odds låses per spelare vid placering —
          befintliga bet påverkas inte av ändringar här.
        </p>

        {/* VM-vinnare */}
        <MarketOddsRow
          type="vm_vinnare"
          label="VM-vinnare"
          tournamentId={tournamentId}
          currentOdds={vmMkt?.odds ?? null}
          updatedAt={vmMkt?.updated_at ?? null}
        />

        <div className="border-t border-gray-100" />

        {/* Bästa målskytt */}
        <MarketOddsRow
          type="skyttekung"
          label="Bästa målskytt"
          tournamentId={tournamentId}
          currentOdds={skyttMkt?.odds ?? null}
          updatedAt={skyttMkt?.updated_at ?? null}
        />

        <div className="border-t border-gray-100" />

        {/* Sveriges mål — fixed payout, not editable */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">Sveriges mål i gruppspelet</p>
          <p className="text-xs text-gray-500">
            Fast utbetalning: <strong>4× insats</strong> — oddsen är inbyggda i reglerna
            och kan inte ändras.
          </p>
        </div>
      </div>
    </section>
  );
}
