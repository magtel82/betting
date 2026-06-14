"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { submitPenaltyScoreAction } from "../actions";

// ─── Geometry (all values are % of the square-ish stage) ───────────────────────
// Goal-mouth proportions follow a real goal (~2.6 : 1 wide-to-tall in this view).
const GOAL = {
  top: 17, bottom: 41,            // goal-mouth vertical band (24% tall)
  postL: 10, postR: 90,           // outer posts (80% wide)
  innerL: 13.5, innerR: 86.5,     // inner net edges (ball travels within)
};
const BALL_SPOT = { x: 50, y: 84 };

// Keeper rest position (its centre, in stage %) and how far it can reach to
// pull off a save. Save/goal is decided purely by whether the keeper's dive
// lands within this reach of the ball — so the visual always matches the result.
const KEEPER_HOME = { x: 50, y: 31 };
const REACH_X = 12;
const REACH_Y = 8;

const LIVES_START = 3;

// ── Splash texts ──
const PERFECT_GOAL = "Mucho Betis! 💚";   // top-corner screamer
const GOAL_CHEERS = ["MÅÅÅL! ⚽", "I KRYSSET! 🎯", "DÄR SATT DEN! 🔥", "OEMOTSTÅNDLIGT! 💥"];
const SAVE_TAUNTS = [
  "Pinsamt. 🤡",
  "Min mormor räddar bättre",
  "Var det ALLT? 🥱",
  "Hahaha, nej. 🧤",
  "Värdelöst. 🗑️",
  "Patetiskt. 💀",
  "Du suger, erkänn det 👎",
  "Genant. Lägg av. 😤",
  "Skäms. 😴",
  "Den tog jag i sömnen 😪",
  "Talanglöst. 🤮",
  "Kioskvältare? Knappast.",
  "Snälla, sluta. 😬",
  "Ynkligt försök. 😒",
  "SOPA! 🧹",
];
const OVER_TAUNTS = [
  "ÖVER RIBBAN! 🚀",
  "Sikta lägre, geni 🙃",
  "Ut på parkeringen! 🅿️",
  "Publiken tackar! 🎁",
  "Rymden ringde 🛸",
  "Är du målvakt eller?? 😂",
  "HAHA, läktaren! 💀",
];
function pick(a: string[]) { return a[Math.floor(Math.random() * a.length)]; }

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
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function PenaltyGame() {
  const router = useRouter();

  const [phase, setPhase]   = useState<Phase>("idle");
  const [score, setScore]   = useState(0);
  const [lives, setLives]   = useState(LIVES_START);
  const [resultText, setResultText] = useState<{ text: string; kind: ShotResult } | null>(null);

  // Locked shot params + animated targets
  const [ballPos, setBallPos]     = useState({ x: BALL_SPOT.x, y: BALL_SPOT.y, scale: 1 });
  const [keeper, setKeeper]       = useState({ x: KEEPER_HOME.x, y: KEEPER_HOME.y, diving: false });
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
  // Everything is continuous. The keeper lunges to a guessed point (gx, gy) and
  // the ball flies to (ballX, ballY). A save happens iff the keeper's dive lands
  // within REACH of the ball — the exact same point we render. So whatever the
  // player sees on screen is, by construction, the real outcome.
  const resolveShot = useCallback((aimX: number, power: number) => {
    const over = power > 0.9;

    // Where the ball ends up.
    const ballX = lerp(GOAL.innerL, GOAL.innerR, aimX);
    const ballY = over
      ? GOAL.top - 8                                   // sails over the bar
      : lerp(GOAL.bottom - 2, GOAL.top + 2, power / 0.9);

    // Keeper skill grows with the current score: dives closer, guesses wrong
    // less often. Early on it's clumsy (easy goals), later it's sharp.
    const skill = Math.min(scoreRef.current / 12, 1);
    const wrongWay = Math.random() < lerp(0.42, 0.16, skill);

    let gx: number, gy: number;
    if (wrongWay) {
      // Commits the wrong way — dives somewhere it isn't.
      gx = lerp(GOAL.innerL + 5, GOAL.innerR - 5, Math.random());
      gy = lerp(GOAL.top + 4, GOAL.bottom - 2, Math.random());
    } else {
      // Reads the shot and lunges toward the ball with some error.
      const spreadX = lerp(26, 11, skill);
      const spreadY = lerp(20, 10, skill);
      gx = ballX + (Math.random() * 2 - 1) * spreadX;
      gy = ballY + (Math.random() * 2 - 1) * spreadY;
    }
    gx = clamp(gx, GOAL.innerL + 3, GOAL.innerR - 3);
    gy = clamp(gy, GOAL.top + 2, GOAL.bottom + 2);

    // Save = keeper's dive overlaps the ball (elliptical reach). Over is always a miss.
    const dx = (ballX - gx) / REACH_X;
    const dy = (ballY - gy) / REACH_Y;
    const result: ShotResult = over ? "over" : (dx * dx + dy * dy <= 1 ? "save" : "goal");

    // Perfect = a goal tucked into a top corner (tight to a post, high power).
    const perfect = result === "goal" && power >= 0.72 && (aimX <= 0.16 || aimX >= 0.84);

    return { result, perfect, ballX, ballY, gx, gy };
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
      setKeeper({ x: KEEPER_HOME.x, y: KEEPER_HOME.y, diving: false });
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
      // Keeper lunges to its guessed point
      setKeeper({ x: shot.gx, y: shot.gy, diving: true });
      // Ball flies — on a save it ends in the keeper's gloves (snapped to the
      // dive point) so it visibly looks caught; otherwise it reaches its target.
      const endX = shot.result === "save" ? shot.gx : shot.ballX;
      const endY = shot.result === "save" ? shot.gy : shot.ballY;
      setBallPos({ x: endX, y: endY, scale: 0.55 });

      // Resolve after the flight animation
      window.setTimeout(() => {
        const isGoal = shot.result === "goal";
        setResultText(
          isGoal                    ? { text: shot.perfect ? PERFECT_GOAL : pick(GOAL_CHEERS), kind: "goal" } :
          shot.result === "save"    ? { text: pick(SAVE_TAUNTS), kind: "save" } :
                                      { text: pick(OVER_TAUNTS), kind: "over" }
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

        // Taunts flash by fast; goals get a beat longer to celebrate.
        const holdMs = nextLives <= 0 ? 1100 : isGoal ? 1050 : 780;

        // Next shot or game over
        window.setTimeout(() => {
          setResultText(null);
          setFlying(false);
          setBallPos({ x: BALL_SPOT.x, y: BALL_SPOT.y, scale: 1 });
          setKeeper({ x: KEEPER_HOME.x, y: KEEPER_HOME.y, diving: false });

          if (nextLives <= 0) {
            setPhase("over");
            submitFinal(scoreRef.current);
          } else {
            resetTimer();
            setPhase("aim");
          }
        }, holdMs);
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
        style={{ background: "linear-gradient(#0a1022 0%, #0d1530 24%, #14224c 34%, #1d7a36 34%, #115226 100%)" }}
      >
        {/* Floodlight glow from the top corners */}
        <div className="pointer-events-none absolute inset-0" aria-hidden style={{
          background:
            "radial-gradient(130% 55% at 16% -10%, rgba(186,230,253,.30), transparent 60%)," +
            "radial-gradient(130% 55% at 84% -10%, rgba(186,230,253,.30), transparent 60%)",
        }} />
        {/* Floodlight banks */}
        <div className="absolute left-[13%] top-1 flex gap-[2px]" aria-hidden>
          {[0,1,2].map((i) => <span key={i} className="h-1.5 w-2.5 rounded-[1px] bg-sky-100 shadow-[0_0_7px_2px_rgba(186,230,253,.55)]" />)}
        </div>
        <div className="absolute right-[13%] top-1 flex gap-[2px]" aria-hidden>
          {[0,1,2].map((i) => <span key={i} className="h-1.5 w-2.5 rounded-[1px] bg-sky-100 shadow-[0_0_7px_2px_rgba(186,230,253,.55)]" />)}
        </div>

        {/* Stands behind the goal */}
        <div className="absolute left-0 right-0" style={{ top: "12%", height: "23%" }} aria-hidden>
          <div className="absolute inset-0 bg-[#0b1228]" />
          <div className="absolute inset-0 opacity-50"
               style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px)", backgroundSize: "6px 6px" }} />
          <div className="absolute inset-0"
               style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.4) 0 1px, transparent 1px 8px)" }} />
        </div>

        {/* Scoreboard — VM 2026 */}
        <div className="absolute left-1/2 top-[3%] z-[1] -translate-x-1/2" aria-hidden>
          <div className="rounded-md border-2 border-gray-900 bg-[#0c1330] px-2.5 py-1 text-center shadow-[2px_2px_0_0_#111827]">
            <div className="font-mono text-[11px] font-black leading-none tracking-[0.2em] text-[#fde047]">VM&nbsp;2026</div>
            <div className="mt-0.5 font-mono text-[7px] font-bold leading-none tracking-[0.25em] text-sky-300/80">USA · CAN · MEX</div>
          </div>
        </div>

        {/* Pitch mowing stripes */}
        <div className="absolute bottom-0 left-0 right-0" style={{ top: "34%",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 16px, rgba(0,0,0,.07) 16px 32px)" }} aria-hidden />
        {/* Penalty arc */}
        <div className="absolute left-1/2 -translate-x-1/2 rounded-[50%] border-2 border-white/25"
             style={{ width: "42%", height: "11%", top: `${BALL_SPOT.y - 10}%` }} aria-hidden />

        {/* Perimeter ad board — WORLD CUP 2026 */}
        <div className="absolute left-[5%] right-[5%] overflow-hidden rounded-[2px] border border-gray-900 bg-[#0c1330]"
             style={{ top: `${GOAL.bottom + 1.5}%`, height: "4.5%" }} aria-hidden>
          <div className="flex h-full items-center justify-center">
            <span className="whitespace-nowrap font-mono text-[7px] font-black uppercase tracking-[0.22em] text-[#fde047]/90">
              ⚽ FIFA WORLD CUP 2026 · FIFA WORLD CUP 2026 ⚽
            </span>
          </div>
        </div>

        {/* Goal frame */}
        <div className="absolute" style={{ left: `${GOAL.postL}%`, right: `${100 - GOAL.postR}%`, top: `${GOAL.top}%`, height: `${GOAL.bottom - GOAL.top}%` }} aria-hidden>
          {/* Net */}
          <div className="absolute inset-0 bg-white/10"
               style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 8px)" }} />
          {/* Posts + bar */}
          <div className="absolute -left-[5px] -top-[5px] bottom-0 w-[5px] rounded-[1px] bg-white shadow-[0_0_0_1.5px_#0b1228]" />
          <div className="absolute -right-[5px] -top-[5px] bottom-0 w-[5px] rounded-[1px] bg-white shadow-[0_0_0_1.5px_#0b1228]" />
          <div className="absolute -left-[5px] -right-[5px] -top-[5px] h-[5px] rounded-[1px] bg-white shadow-[0_0_0_1.5px_#0b1228]" />
        </div>

        {/* Penalty spot */}
        <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90"
             style={{ left: `${BALL_SPOT.x}%`, top: `${BALL_SPOT.y}%` }} aria-hidden />

        {/* Keeper */}
        <Keeper x={keeper.x} y={keeper.y} diving={keeper.diving} />

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

        {/* Aim meter — vertical tick gliding across the goal mouth */}
        {phase === "aim" && (
          <div className="absolute z-30 w-[3px] -translate-x-1/2 rounded bg-red-500 shadow-[0_0_8px_1px_rgba(239,68,68,.8)]"
               ref={aimEl} style={{ left: "50%", top: `${GOAL.top - 1}%`, height: `${GOAL.bottom - GOAL.top + 2}%` }} />
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
          <div className="absolute inset-0 z-40 flex items-center justify-center px-6" aria-hidden>
            <span
              className={`pg-pop max-w-full rounded-xl border-2 border-gray-900 bg-gray-900/80 px-4 py-2 text-center font-mono text-2xl font-black uppercase leading-tight tracking-tight shadow-[3px_3px_0_0_#111827] ${
                resultText.kind === "goal" ? "text-yellow-300 -rotate-2" : resultText.kind === "save" ? "text-sky-200 rotate-1" : "text-red-300 -rotate-1"
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
                <span className="rounded-full border-2 border-gray-900 bg-[#0c1330] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-[#fde047] shadow-[2px_2px_0_0_#111827]">VM 2026</span>
                <span className="text-5xl drop-shadow-[2px_2px_0_#111827]">🥅</span>
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
    </div>
  );
}

// ─── Keeper character (SVG, cartoon-pixel) ─────────────────────────────────────
// Centre-anchored at (x, y) in stage % — the same point used to decide saves —
// so wherever the keeper is drawn is exactly where it can reach.
function Keeper({ x, y, diving }: { x: number; y: number; diving: boolean }) {
  const lean = clamp((x - KEEPER_HOME.x) / 2.6, -22, 22); // tilt toward the dive
  return (
    <div
      className="absolute z-10 will-change-transform"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        height: "21%",
        width: "22%",
        transform: `translate(-50%, -50%) rotate(${lean}deg)`,
        transition: diving
          ? "left .42s cubic-bezier(.2,.7,.3,1.15), top .42s cubic-bezier(.2,.7,.3,1.15), transform .42s cubic-bezier(.2,.7,.3,1.15)"
          : "left .3s ease-out, top .3s ease-out, transform .3s ease-out",
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
