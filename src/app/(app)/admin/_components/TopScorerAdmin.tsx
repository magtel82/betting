"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  importTopScorersAction,
  removeTopScorerAction,
  clearTopScorersAction,
} from "../actions";
import type { ActionState } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopScorerRow {
  selection: string;
  odds:      number;
  source:    string;
}

interface Props {
  marketId: string;
  players:  TopScorerRow[];
}

// ─── Submit helpers ───────────────────────────────────────────────────────────

function ImportBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Importerar…" : "Importera"}
    </button>
  );
}

function RemoveBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-gray-400 hover:text-[var(--loss)] disabled:opacity-40"
      title="Ta bort"
    >
      {pending ? "…" : "✕"}
    </button>
  );
}

function ClearBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-[var(--loss)] underline hover:opacity-70 disabled:opacity-40"
    >
      {pending ? "Rensar…" : "Rensa hela listan"}
    </button>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if ("error"   in state) return <p className="text-xs text-[var(--loss)]">{state.error}</p>;
  if ("success" in state) return <p className="text-xs text-[var(--win)]">{state.success}</p>;
  return null;
}

// ─── TopScorerAdmin ───────────────────────────────────────────────────────────

export function TopScorerAdmin({ marketId, players }: Props) {
  const [importState, importAction] = useActionState<ActionState, FormData>(importTopScorersAction, null);
  const [clearState,  clearAction]  = useActionState<ActionState, FormData>(clearTopScorersAction, null);
  const [pasteText, setPasteText]   = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Skyttekung — spelare &amp; odds</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <p className="text-xs text-gray-500">
          Administrera listan med spelare och individuella odds för marknaden <strong>Bästa målskytt</strong>.
          Spelarna visas i en dropdown i /specialbet. Odds låses vid placement.
        </p>

        {/* Current player list */}
        {players.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">
              Nuvarande lista ({players.length} spelare)
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
              {players.map((p) => (
                <PlayerRow key={p.selection} marketId={marketId} player={p} />
              ))}
            </div>
            {/* Clear all */}
            <div className="pt-1">
              {showClearConfirm ? (
                <form action={clearAction} onSubmit={() => setShowClearConfirm(false)}>
                  <input type="hidden" name="market_id" value={marketId} />
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-600">Rensa alla {players.length} spelare?</p>
                    <ClearBtn />
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="text-xs text-gray-400 underline"
                    >
                      Avbryt
                    </button>
                  </div>
                  <Feedback state={clearState} />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-gray-400 underline hover:text-[var(--loss)]"
                >
                  Rensa hela listan
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Ingen lista inlagd ännu.</p>
        )}

        {/* Import / paste */}
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-700">Importera ny lista</p>
          <p className="text-xs text-gray-500">
            En spelare per rad, format: <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">Namn|Odds</code> — t.ex. <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">Kylian Mbappé|7.00</code><br />
            Befintliga spelare med samma namn uppdateras. Övriga berörs inte.
          </p>
          <form action={importAction} className="space-y-3" onSubmit={() => setPasteText("")}>
            <input type="hidden" name="market_id" value={marketId} />
            <textarea
              name="players"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Kylian Mbappé|7.00\nHarry Kane|8.00\nErling Haaland|15.00"}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs text-gray-900 focus:border-[var(--primary)] focus:outline-none resize-y"
            />
            <div className="flex items-center gap-3">
              <ImportBtn />
              <Feedback state={importState} />
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

function PlayerRow({ marketId, player }: { marketId: string; player: TopScorerRow }) {
  const [removeState, removeAction] = useActionState<ActionState, FormData>(removeTopScorerAction, null);

  return (
    <div className="flex items-center justify-between px-3 py-2 gap-3">
      <div className="min-w-0 flex items-center gap-2">
        <span className="truncate text-sm text-gray-900">{player.selection}</span>
        {player.source === "the-odds-api" && (
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-500 shrink-0">API</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="tabular-nums text-sm font-semibold text-gray-700">{Number(player.odds).toFixed(2)}</span>
        <form action={removeAction}>
          <input type="hidden" name="market_id"  value={marketId} />
          <input type="hidden" name="selection"  value={player.selection} />
          <RemoveBtn />
        </form>
      </div>
      {removeState && "error" in removeState && (
        <p className="absolute text-xs text-[var(--loss)]">{removeState.error}</p>
      )}
    </div>
  );
}
