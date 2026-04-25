"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { settleSpecialMarketAction } from "../actions";
import type { ActionState } from "../actions";
import type { SpecialMarket, SpecialMarketType } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveBetSummary {
  selection_text: string;
  count:          number;
}

interface MarketWithBets extends SpecialMarket {
  activeBets: ActiveBetSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MARKET_META: Record<SpecialMarketType, { label: string; placeholder: string }> = {
  vm_vinnare:  { label: "VM-vinnare",                    placeholder: "t.ex. Brasilien" },
  skyttekung:  { label: "Bästa målskytt",                placeholder: "t.ex. Mbappé" },
  sverige_mal: { label: "Sveriges mål i gruppspelet",    placeholder: "t.ex. 4" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ─── SubmitButton ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {pending ? "Avgör…" : "Avgör marknaden"}
    </button>
  );
}

// ─── MarketSettleRow ──────────────────────────────────────────────────────────

function MarketSettleRow({ market }: { market: MarketWithBets }) {
  const [state, action] = useActionState<ActionState, FormData>(
    settleSpecialMarketAction,
    null,
  );

  const meta = MARKET_META[market.type];

  // Already settled — show result only
  if (market.settled_at) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">{meta.label}</p>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
            Avgjord
          </span>
        </div>
        <p className="text-sm text-gray-900">
          Vinnare: <strong>{market.result_text}</strong>
        </p>
        <p className="text-[11px] text-gray-400">Avgjord {fmtDate(market.settled_at)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{meta.label}</p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Ej avgjord
        </span>
      </div>

      {/* Active bet selections — helps admin enter the exact matching text */}
      {market.activeBets.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            Aktiva bet ({market.activeBets.reduce((s, b) => s + b.count, 0)} st)
          </p>
          <ul className="space-y-0.5">
            {market.activeBets.map((b) => (
              <li key={b.selection_text} className="flex items-center justify-between text-xs text-gray-700">
                <span className="font-medium">{b.selection_text}</span>
                <span className="text-gray-400">{b.count} bet</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {market.activeBets.length === 0 && (
        <p className="text-xs text-gray-400">Inga aktiva bet för den här marknaden.</p>
      )}

      <form action={action} className="space-y-2">
        <input type="hidden" name="market_id" value={market.id} />

        <div className="flex items-center gap-2">
          <input
            type={market.type === "sverige_mal" ? "number" : "text"}
            name="result_text"
            min={market.type === "sverige_mal" ? 0 : undefined}
            step={market.type === "sverige_mal" ? 1 : undefined}
            placeholder={meta.placeholder}
            required
            className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            aria-label={`Utfall för ${meta.label}`}
          />
          <SubmitButton />
        </div>

        <p className="text-[11px] text-gray-400">
          Matchning sker case-insensitivt. Bet med exakt detta val vinner.
        </p>

        {state && "error" in state && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-sm text-green-600">{state.success}</p>
        )}
      </form>
    </div>
  );
}

// ─── SpecialSettlePanel ───────────────────────────────────────────────────────

interface Props {
  markets: MarketWithBets[];
}

export function SpecialSettlePanel({ markets }: Props) {
  if (markets.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Avgör specialbet</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <p className="text-xs text-gray-500">
          Fastställ utfallet för varje marknad. Settlement kan bara köras en gång per marknad —
          alla aktiva bet avgörs och vinnande bet krediteras special_wallet direkt.
        </p>

        {markets.map((market, i) => (
          <div key={market.id}>
            {i > 0 && <div className="border-t border-gray-100 -mx-4 mb-5" />}
            <MarketSettleRow market={market} />
          </div>
        ))}
      </div>
    </section>
  );
}

export type { MarketWithBets };
