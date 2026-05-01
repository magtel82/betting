"use client";

import { useState, useTransition } from "react";
import {
  lockSlipsAction,
  applyInactivityFeeAction,
  applyGroupBonusAction,
} from "../actions";
import type { LockSlipsResult }           from "@/lib/betting/lock-slips";
import type { ApplyInactivityFeeResult }  from "@/lib/betting/inactivity-fee";
import type { GroupBonusResult }          from "@/lib/betting/group-bonus";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  defaultFeeDate: string; // YYYY-MM-DD in Swedish time, passed from server
}

// ─── EconomyPanel ─────────────────────────────────────────────────────────────

export function EconomyPanel({ defaultFeeDate }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Ekonomi</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-5">
        <LockSection />
        <div className="border-t border-gray-100 pt-5">
          <FeeSection defaultFeeDate={defaultFeeDate} />
        </div>
        <div className="border-t border-gray-100 pt-5">
          <BonusSection />
        </div>
      </div>
    </section>
  );
}

// ─── Slip-låsning ─────────────────────────────────────────────────────────────

function LockSection() {
  const [result,    setResult]    = useState<LockSlipsResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle() {
    setResult(null);
    startTransition(async () => { setResult(await lockSlipsAction()); });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Slip-låsning</p>
      <p className="text-xs text-gray-500">
        Låser alla öppna slip där minst en match har startat. Idempotent — safe att köra
        upprepade gånger.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handle}
          disabled={isPending}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
        >
          {isPending ? "Låser…" : "Lås startade slip"}
        </button>
        {result && (
          result.ok
            ? <p className="text-sm text-[var(--win)]">{result.locked} slip låsta.</p>
            : <p className="text-sm text-[var(--loss)]">{result.error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Inaktivitetsavgift ───────────────────────────────────────────────────────

function FeeSection({ defaultFeeDate }: { defaultFeeDate: string }) {
  const [date,      setDate]      = useState(defaultFeeDate);
  const [result,    setResult]    = useState<ApplyInactivityFeeResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle() {
    if (!date) return;
    setResult(null);
    startTransition(async () => { setResult(await applyInactivityFeeAction(date)); });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Inaktivitetsavgift</p>
      <p className="text-xs text-gray-500">
        Drar 50 coins (max saldo) från inaktiva spelare på angiven matchdag.
        Idempotent per dag — körs inte dubbelt.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setResult(null); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handle}
          disabled={isPending || !date}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
        >
          {isPending ? "Tillämpar…" : "Tillämpa avgift"}
        </button>
      </div>
      {result && <FeeResultBadge result={result} />}
    </div>
  );
}

function FeeResultBadge({ result }: { result: ApplyInactivityFeeResult }) {
  if (!result.ok) return <p className="text-sm text-[var(--loss)]">{result.error}</p>;
  if (result.skipped === "not_a_matchday") {
    return <p className="text-sm text-gray-500">Ingen matchdag — ingen avgift.</p>;
  }
  const parts: string[] = [];
  if (result.charged  > 0) parts.push(`${result.charged} debiterade`);
  if (result.active   > 0) parts.push(`${result.active} aktiva (ej debiterade)`);
  if (result.skipZero > 0) parts.push(`${result.skipZero} med tomt saldo`);
  if (result.skipIdem > 0) parts.push(`${result.skipIdem} redan klara`);
  return <p className="text-sm text-[var(--win)]">{parts.join(", ") || "Inga åtgärder."}</p>;
}

// ─── Gruppbonus ───────────────────────────────────────────────────────────────

function BonusSection() {
  const [result,    setResult]    = useState<GroupBonusResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle() {
    setResult(null);
    startTransition(async () => { setResult(await applyGroupBonusAction()); });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Bonus efter gruppspel</p>
      <p className="text-xs text-gray-500">
        Delar ut bonus till alla aktiva spelare när alla gruppspelsmatcher är avgjorda.
        1:a +500 · 2:a +300 · 3:a +200 · övriga +100.
        Idempotent — kan inte delas ut två gånger.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handle}
          disabled={isPending}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
        >
          {isPending ? "Delar ut…" : "Dela ut gruppbonus"}
        </button>
        {result && <BonusResultBadge result={result} />}
      </div>
      {result && "bonuses" in result && result.bonuses.length > 0 && (
        <BonusResultDetail bonuses={result.bonuses} />
      )}
    </div>
  );
}

function BonusResultBadge({ result }: { result: GroupBonusResult }) {
  if (!result.ok) return <p className="text-sm text-[var(--loss)]">{result.error}</p>;
  if ("skipped" in result) return <p className="text-sm text-gray-500">Redan utdelad.</p>;
  return (
    <p className="text-sm text-[var(--win)]">
      Bonus utdelad till {result.bonuses.length} spelare.
    </p>
  );
}

function BonusResultDetail({ bonuses }: { bonuses: { placement: number; bonus: number }[] }) {
  const byPlacement = new Map<number, { count: number; bonus: number }>();
  for (const b of bonuses) {
    const e = byPlacement.get(b.placement) ?? { count: 0, bonus: b.bonus };
    byPlacement.set(b.placement, { count: e.count + 1, bonus: b.bonus });
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
      {Array.from(byPlacement.entries())
        .sort(([a], [b]) => a - b)
        .map(([place, { count, bonus }]) => (
          <p key={place}>
            {ordinal(place)}: {count} {count === 1 ? "spelare" : "spelare"} × +{bonus} coins
          </p>
        ))}
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return "1:a";
  if (n === 2) return "2:a";
  if (n === 3) return "3:a";
  return `${n}:e`;
}
