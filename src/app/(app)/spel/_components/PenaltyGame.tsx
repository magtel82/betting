"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { submitPenaltyScoreAction } from "../actions";
import type { LeaderRow } from "../page";

// ─── Geometry (all values are % of the square-ish stage) ───────────────────────
const GOAL = {
  top: 14, bottom: 46,            // goal-mouth vertical band
  postL: 16, postR: 84,           // outer posts
  innerL: 19, innerR: 81,         // inner net edges (ball travels within)
};
const BALL_SPOT = { x: 50, y: 82 };
const KEEPER_COLS = [0.27, 0.5, 0.73]; // x fraction within inner goal for the 3 dive columns

const LIVES_START = 3;

type Phase = "idle" | "aim" | "power" | "shoot" | "result" | "over";
type ShotResult = "goal" | "save" | "over";

// triangle wave 0→1→0, period 2
function triangle(x: number) {
  const m = ((x % 2) + 2) % 2;
  return m < 1 ? m : 2 - m;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function PenaltyGame({ leaderboard, hasPlayed }: { leaderboard: LeaderRow[]; hasPlayed: boolean }) {
  const router = useRouter();

  const [phase, setPhase]   = useState<Phase>("idle");
  const [score, setScore]   = useState(0);
  const [lives, setLives]   = useState(LIVES_START);
  const [resultText, setResultText] = useState<{ text: string; kind: ShotResult } | null>(null);

  // Locked shot params + animated targets
  const [ballPos, setBallPos]     = useState({ x: BALL_SPOT.x, y: BALL_SPOT.y, scale: 1 });
  const [keeper, setKeeper]       = useState({ x: 50, dive: 0, high: false });
  const [flying, setFlying]       = useState(false);

  // Submission feedback
  const [finalInfo, setFinalInfo] = useState<{ best: number; isRecord: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Animation refs ──
  const phaseRef    = useRef(phase);
  const scoreRef    = useRef(score);
  const livesRef    = useRef(lives);
  const aimPosRef   = useRef(0.5);
  const powerPosRef = useRef(0);
  const startRef    = useRef(0);
  const aimEl       = useRef<HTMLDivElement>(null);
  const powerEl     = useRef<HTMLDivElement>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { livesRef.current = lives; }, [lives]);

  // Single rAF loop drives whichever meter is active.
  useEffect(() => {
    let raf = 0;
    function tick(t: number) {
      if (!startRef.current) startRef.current = t;
      const elapsed = (t - startRef.current) / 1000;
      const d = scoreRef.current;
      const ph = phaseRef.current;
      if (ph === "aim") {
        const speed = Math.min(0.75 + d * 0.06, 1.7);
        const pos = triangle(elapsed * speed);
        aimPosRef.current = pos;
        if (aimEl.current) aimEl.current.style.left = `${lerp(GOAL.innerL, GOAL.innerR, pos)}%`;
      } else if (ph === "power") {
        const speed = Math.min(0.85 + d * 0.07, 1.9);
        const pos = triangle(elapsed * speed);
        powerPosRef.current = pos;
        if (powerEl.current) powerEl.current.style.bottom = `${pos * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const resetTimer = () => { startRef.current = 0; };

  // Persist the finished run's score (called once, at game over).
  const submitFinal = useCallback((finalScore: number) => {
    setSubmitting(true);
    submitPenaltyScoreAction(finalScore)
      .then((res) => {
        if (res.ok) {
          setFinalInfo({ best: res.best, isRecord: res.isRecord });
          router.refresh(); // refresh server-rendered leaderboard
        }
      })
      .finally(() => setSubmitting(false));
  }, [router]);

  // ── Shot resolution ──
  const resolveShot = useCallback((aimX: number, power: number) => {
    const col = aimX < 0.34 ? 0 : aimX < 0.67 ? 1 : 2;
    const over = power > 0.9;
    const rowHigh = power >= 0.5 && !over;

    const d = scoreRef.current;
    const pCorrect = Math.min(0.30 + d * 0.06, 0.78);
    const guessCol = Math.random() < pCorrect ? col : Math.floor(Math.random() * 3);
    const guessHigh = Math.random() < (0.34 + d * 0.03);

    let result: ShotResult;
    if (over) result = "over";
    else if (guessCol === col && guessHigh === rowHigh) result = "save";
    else result = "goal";

    // Ball target within the goal mouth (continuous for natural flight)
    const targetX = lerp(GOAL.innerL, GOAL.innerR, aimX);
    const targetY = over
      ? GOAL.top - 8                                   // sails over the bar
      : lerp(GOAL.bottom - 3, GOAL.top + 3, power / 0.9);

    // Keeper goes to its guessed column + height
    const keeperX = lerp(GOAL.innerL, GOAL.innerR, KEEPER_COLS[guessCol]);

    return { result, targetX, targetY, keeperX, guessHigh };
  }, []);

  // ── Main tap handler ──
  const handleAction = useCallback(() => {
    const ph = phaseRef.current;

    if (ph === "idle" || ph === "over") {
      // Start a fresh game
      setScore(0);
      setLives(LIVES_START);
      setFinalInfo(null);
      setResultText(null);
      setBallPos({ x: BALL_SPOT.x, y: BALL_SPOT.y, scale: 1 });
      setKeeper({ x: 50, dive: 0, high: false });
      setFlying(false);
      resetTimer();
      setPhase("aim");
      return;
    }

    if (ph === "aim") {
      resetTimer();
      setPhase("power");
      return;
    }

    if (ph === "power") {
      const aimX  = aimPosRef.current;
      const power = powerPosRef.current;
      const shot  = resolveShot(aimX, power);

      setPhase("shoot");
      setFlying(true);
      // Keeper dives
      const diveDir = shot.keeperX < 45 ? -1 : shot.keeperX > 55 ? 1 : 0;
      setKeeper({ x: shot.keeperX, dive: diveDir, high: shot.guessHigh });
      // Ball flies
      setBallPos({ x: shot.targetX, y: shot.targetY, scale: 0.55 });

      // Resolve after the flight animation
      window.setTimeout(() => {
        const isGoal = shot.result === "goal";
        setResultText(
          isGoal                    ? { text: "MÅÅÅL! ⚽",      kind: "goal" } :
          shot.result === "save"    ? { text: "RÄDDNING! 🧤",   kind: "save" } :
                                      { text: "ÖVER RIBBAN! 😱", kind: "over" }
        );
        setPhase("result");

        // Compute next score/lives deterministically via refs.
        let nextLives = livesRef.current;
        if (isGoal) {
          setScore(scoreRef.current + 1);
        } else {
          nextLives = livesRef.current - 1;
          setLives(nextLives);
        }

        // Next shot or game over
        window.setTimeout(() => {
          setResultText(null);
          setFlying(false);
          setBallPos({ x: BALL_SPOT.x, y: BALL_SPOT.y, scale: 1 });
          setKeeper({ x: 50, dive: 0, high: false });

          if (nextLives <= 0) {
            setPhase("over");
            submitFinal(scoreRef.current);
          } else {
            resetTimer();
            setPhase("aim");
          }
        }, 1150);
      }, 620);
      return;
    }
  }, [resolveShot, submitFinal]);

  const actionLabel =
    phase === "idle"  ? "SPELA!" :
    phase === "aim"   ? "SIKTA 🎯" :
    phase === "power" ? "SKJUT! ⚽" :
    phase === "over"  ? "SPELA IGEN" : "";

  const canTap = phase === "idle" || phase === "aim" || phase === "power" || phase === "over";

  return (
    <div className="space-y-4">
      <PenaltyStyles />

      {/* ── Header: score + lives ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-xl border-2 border-gray-900 bg-white px-4 py-2.5 shadow-[3px_3px_0_0_#111827]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black tabular-nums text-[var(--primary)]">{score}</span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">mål</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">liv</span>
          {Array.from({ length: LIVES_START }).map((_, i) => (
            <span key={i} className={`text-lg leading-none ${i < lives ? "" : "opacity-20 grayscale"}`}>⚽</span>
          ))}
        </div>
      </div>

      {/* ── Stage ─────────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => canTap && handleAction()}
        disabled={!canTap}
        aria-label="Spelplan — tryck för att sikta och skjuta"
        className="relative block w-full overflow-hidden rounded-2xl border-[3px] border-gray-900 shadow-[4px_4px_0_0_#111827] aspect-[4/5] select-none"
        style={{ background: "linear-gradient(#7dd3fc 0%, #bae6fd 38%, #4ade80 38%, #22c55e 100%)" }}
      >
        {/* Sun */}
        <div className="absolute left-3 top-3 h-8 w-8 rounded-full bg-yellow-300 border-2 border-gray-900" aria-hidden />
        {/* Crowd stripe */}
        <div className="absolute left-0 right-0 top-[30%] h-[8%] flex" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="flex-1" style={{ background: ["#f87171","#fbbf24","#60a5fa","#34d399","#f472b6"][i % 5], opacity: 0.5 }} />
          ))}
        </div>

        {/* Goal frame */}
        <div className="absolute" style={{ left: `${GOAL.postL}%`, right: `${100 - GOAL.postR}%`, top: `${GOAL.top}%`, height: `${GOAL.bottom - GOAL.top}%` }} aria-hidden>
          {/* Net */}
          <div className="absolute inset-0 bg-white/35"
               style={{ backgroundImage: "repeating-linear-gradient(0deg, #ffffff66 0 1px, transparent 1px 9px), repeating-linear-gradient(90deg, #ffffff66 0 1px, transparent 1px 9px)" }} />
          {/* Posts + bar */}
          <div className="absolute -left-[6px] -top-[6px] bottom-0 w-[6px] bg-white border-2 border-gray-900" />
          <div className="absolute -right-[6px] -top-[6px] bottom-0 w-[6px] bg-white border-2 border-gray-900" />
          <div className="absolute -left-[6px] -right-[6px] -top-[6px] h-[6px] bg-white border-2 border-gray-900" />
        </div>

        {/* Penalty spot */}
        <div className="absolute h-2 w-2 -translate-x-1/2 rounded-full bg-white border border-gray-900"
             style={{ left: `${BALL_SPOT.x}%`, top: `${BALL_SPOT.y + 4}%` }} aria-hidden />

        {/* Keeper */}
        <Keeper x={keeper.x} dive={keeper.dive} high={keeper.high} />

        {/* Ball */}
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 will-change-transform"
          style={{
            left: `${ballPos.x}%`,
            top: `${ballPos.y}%`,
            transform: `translate(-50%,-50%) scale(${ballPos.scale})`,
            transition: flying ? "left .6s cubic-bezier(.2,.6,.3,1), top .6s cubic-bezier(.2,.6,.3,1), transform .6s ease-out" : "none",
          }}
          aria-hidden
        >
          <span className="text-3xl leading-none drop-shadow">⚽</span>
        </div>

        {/* Aim meter — horizontal tick gliding across the goal */}
        {phase === "aim" && (
          <>
            <div className="absolute z-30 h-[34%] w-[3px] -translate-x-1/2 bg-red-500 shadow-[0_0_0_1px_#111827]"
                 ref={aimEl} style={{ left: "50%", top: `${GOAL.top}%` }} />
            <div className="absolute z-30 -translate-x-1/2"
                 style={{ left: `${(GOAL.innerL + GOAL.innerR) / 2}%`, top: `${GOAL.bottom + 2}%` }}>
              <span className="font-mono text-[10px] font-black uppercase tracking-widest text-white drop-shadow-[1px_1px_0_#111827]">‹ sikta ›</span>
            </div>
          </>
        )}

        {/* Power meter — vertical bar on the right */}
        {phase === "power" && (
          <div className="absolute right-2 z-30 w-3 overflow-hidden rounded-full border-2 border-gray-900"
               style={{ top: `${GOAL.bottom + 6}%`, height: "30%", background: "linear-gradient(#dc2626, #f59e0b 45%, #16a34a 80%)" }}>
            <div ref={powerEl} className="absolute left-0 right-0 h-[3px] bg-white shadow-[0_0_0_1px_#111827]" style={{ bottom: "0%" }} />
          </div>
        )}

        {/* Result splash */}
        {resultText && (
          <div className="absolute inset-0 z-40 flex items-center justify-center" aria-hidden>
            <span
              className={`pg-pop font-mono text-3xl font-black uppercase tracking-tight drop-shadow-[2px_2px_0_#111827] ${
                resultText.kind === "goal" ? "text-yellow-300" : resultText.kind === "save" ? "text-sky-200" : "text-red-300"
              }`}
            >
              {resultText.text}
            </span>
          </div>
        )}

        {/* Idle / over overlay */}
        {(phase === "idle" || phase === "over") && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-gray-900/55 backdrop-blur-[1px]">
            {phase === "over" ? (
              <>
                <span className="font-mono text-sm font-black uppercase tracking-widest text-white/70">Game Over</span>
                <span className="font-mono text-5xl font-black text-yellow-300 drop-shadow-[2px_2px_0_#111827]">{score}</span>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-white/70">mål denna gång</span>
                {submitting && <span className="text-[11px] text-white/60">sparar…</span>}
                {finalInfo && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                    {finalInfo.isRecord ? "🏆 Nytt rekord!" : `Ditt rekord: ${finalInfo.best}`}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-5xl">🥅</span>
                <span className="font-mono text-xl font-black uppercase tracking-tight text-white drop-shadow-[2px_2px_0_#111827]">Straffspecialisten</span>
                <span className="max-w-[80%] text-center text-[11px] leading-relaxed text-white/80">
                  Sikta, tajma kraften och lura målvakten. Tre missar och du är ute!
                </span>
              </>
            )}
          </div>
        )}
      </button>

      {/* ── Action button ─────────────────────────────────────────────────────── */}
      {actionLabel && (
        <button
          type="button"
          onClick={handleAction}
          className="w-full rounded-xl border-[3px] border-gray-900 bg-[var(--coin)] py-3 font-mono text-base font-black uppercase tracking-wider text-gray-900 shadow-[4px_4px_0_0_#111827] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#111827]"
        >
          {actionLabel}
        </button>
      )}

      {phase !== "idle" && phase !== "over" && (
        <p className="text-center font-mono text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {phase === "aim" ? "Tryck för att låsa riktning" : phase === "power" ? "Tryck för att skjuta" : "…"}
        </p>
      )}

      {/* ── Leaderboard ───────────────────────────────────────────────────────── */}
      <section className="pt-2">
        <h2 className="mb-2 flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-gray-500">
          🏆 Topplista
        </h2>
        {leaderboard.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white py-6 text-center">
            <p className="text-sm font-medium text-gray-600">Ingen har spelat ännu</p>
            <p className="mt-0.5 text-xs text-gray-400">Bli först att sätta ett rekord!</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border-2 border-gray-900 bg-white shadow-[3px_3px_0_0_#111827]">
            {leaderboard.map((row, i) => (
              <div key={row.memberId}
                   className={`flex items-center gap-3 px-4 py-2.5 ${i < leaderboard.length - 1 ? "border-b border-gray-100" : ""} ${row.isMe ? "bg-[var(--primary-50)]" : ""}`}>
                <span className="w-6 text-center font-mono text-sm font-black text-gray-400">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className={`flex-1 truncate text-sm ${row.isMe ? "font-bold text-[var(--primary-600)]" : "font-medium text-gray-900"}`}>
                  {row.name}{row.isMe && <span className="ml-1.5 text-[10px] font-bold uppercase text-[var(--primary)]">du</span>}
                </span>
                <span className="font-mono text-base font-black tabular-nums text-gray-900">{row.best}</span>
              </div>
            ))}
          </div>
        )}
        {!hasPlayed && leaderboard.length > 0 && (
          <p className="mt-2 text-center text-[11px] text-gray-400">Du står inte på listan ännu — kör en match!</p>
        )}
      </section>
    </div>
  );
}

// ─── Keeper character (SVG, cartoon-pixel) ─────────────────────────────────────
function Keeper({ x, dive, high }: { x: number; dive: number; high: boolean }) {
  const rotate = dive * 16;
  const lift = high ? -14 : 0;
  return (
    <div
      className="absolute z-10 -translate-x-1/2 will-change-transform"
      style={{
        left: `${x}%`,
        top: `${GOAL.bottom - 33}%`,
        height: "34%",
        width: "27%",
        transform: `translateX(-50%) translateY(${lift}%) rotate(${rotate}deg)`,
        transition: "left .45s cubic-bezier(.3,.7,.4,1), transform .45s cubic-bezier(.3,.7,.4,1)",
      }}
      aria-hidden
    >
      <KeeperSvg />
    </div>
  );
}

const JERSEY = "#fb923c";   // orange keeper kit
const SHORTS = "#1f2937";   // navy
const SKIN   = "#f7c89a";
const OUTLINE = "#111827";

function KeeperSvg() {
  return (
    <svg viewBox="-6 0 112 132" preserveAspectRatio="xMidYMax meet" className="h-full w-full overflow-visible">
      <g stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
        {/* Arms (behind torso), raised in a wide save pose */}
        <rect x="6"  y="52" width="30" height="12" rx="6" fill={JERSEY} transform="rotate(18 34 58)" />
        <rect x="64" y="52" width="30" height="12" rx="6" fill={JERSEY} transform="rotate(-18 66 58)" />

        {/* Legs + boots */}
        <rect x="39" y="98"  width="9"  height="20" rx="3" fill={SKIN} />
        <rect x="52" y="98"  width="9"  height="20" rx="3" fill={SKIN} />
        <rect x="35" y="114" width="15" height="9"  rx="4" fill={OUTLINE} />
        <rect x="50" y="114" width="15" height="9"  rx="4" fill={OUTLINE} />

        {/* Shorts */}
        <rect x="34" y="84" width="32" height="20" rx="6" fill={SHORTS} />

        {/* Torso / jersey */}
        <rect x="33" y="48" width="34" height="42" rx="9" fill={JERSEY} />
        {/* collar */}
        <path d="M44 50 L50 57 L56 50" fill="none" stroke={OUTLINE} strokeWidth={3.5} />

        {/* Neck */}
        <rect x="46" y="42" width="8" height="8" rx="2" fill={SKIN} />

        {/* Head */}
        <circle cx="50" cy="33" r="14" fill={SKIN} />
        {/* Cap dome + brim */}
        <path d="M37 31 a13 13 0 0 1 26 0 Z" fill={JERSEY} />
        <path d="M50 31 q15 -1 19 5 q-10 2 -19 -2 Z" fill={JERSEY} />

        {/* Gloves */}
        <rect x="-4" y="40" width="20" height="19" rx="7" fill="#ffffff" />
        <rect x="84" y="40" width="20" height="19" rx="7" fill="#ffffff" />
        {/* glove cuffs */}
        <rect x="13" y="44" width="6" height="13" rx="2.5" fill="#ef4444" />
        <rect x="81" y="44" width="6" height="13" rx="2.5" fill="#ef4444" />
      </g>

      {/* Face — drawn without the heavy outline */}
      <circle cx="45" cy="35" r="2.1" fill={OUTLINE} />
      <circle cx="55" cy="35" r="2.1" fill={OUTLINE} />
      <path d="M45 40 q5 4 10 0" fill="none" stroke={OUTLINE} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

// ─── Local keyframes ───────────────────────────────────────────────────────────
function PenaltyStyles() {
  return (
    <style>{`
      @keyframes pgPop {
        0%   { transform: scale(.4); opacity: 0; }
        40%  { transform: scale(1.15); opacity: 1; }
        70%  { transform: scale(.98); }
        100% { transform: scale(1); opacity: 1; }
      }
      .pg-pop { animation: pgPop .35s cubic-bezier(.3,1.4,.5,1) both; }
    `}</style>
  );
}
