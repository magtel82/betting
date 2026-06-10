"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vm_bet_2026_welcome_seen";
const COLORS = ["#1a56db", "#f59e0b", "#16a34a", "#dc2626", "#ffffff", "#fbbf24", "#a78bfa"];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  width: number;
  height: number;
  rotation: number;
};

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    left:     Math.random() * 100,
    delay:    Math.random() * 2.5,
    duration: 2.8 + Math.random() * 2.2,
    color:    COLORS[Math.floor(Math.random() * COLORS.length)],
    width:    6 + Math.random() * 8,
    height:   4 + Math.random() * 5,
    rotation: Math.random() * 360,
  }));
}

export function WelcomeModal() {
  const [visible, setVisible]     = useState(false);
  const [particles]               = useState(() => makeParticles(70));

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Konfetti */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              position:        "absolute",
              left:            `${p.left}%`,
              top:             "-16px",
              width:           `${p.width}px`,
              height:          `${p.height}px`,
              backgroundColor: p.color,
              borderRadius:    "2px",
              transform:       `rotate(${p.rotation}deg)`,
              animation:       `vmConfettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
            }}
          />
        ))}
      </div>

      {/* Overlay + modal */}
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center px-4"
        style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
        onClick={dismiss}
      >
        <div
          className="relative w-full max-w-sm overflow-hidden rounded-2xl p-8 text-center text-white shadow-2xl"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #1e3a8a 100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 text-6xl leading-none">⚽</div>

          <h1 className="text-2xl font-black leading-tight tracking-tight">
            Nu jävlar kör vi<br />VM-betting!
          </h1>

          <p className="mt-3 text-sm font-medium text-gray-400">
            VM 2026 · 11 juni – 19 juli
          </p>

          <button
            onClick={dismiss}
            className="mt-7 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow transition-colors"
            style={{ backgroundColor: "var(--primary)" }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-600)")}
            onMouseOut={(e)  => (e.currentTarget.style.backgroundColor = "var(--primary)")}
          >
            Sätt igång! 🪙
          </button>
        </div>
      </div>

      <style>{`
        @keyframes vmConfettiFall {
          0%   { transform: translateY(0)     rotate(0deg);   opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(105vh) rotate(600deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}
