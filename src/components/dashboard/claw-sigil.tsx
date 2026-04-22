"use client";

import { useEffect, useState } from "react";

export function ClawSigil({ paused }: { paused?: boolean }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (paused) return;
    let raf: number;
    let start: number | undefined;
    const loop = (ts: number) => {
      start ??= ts;
      setT((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  const beamX = 50 + Math.sin(t * 0.6) * 30;

  return (
    <div className="fa-sigil">
      <svg viewBox="0 0 220 220" width={220} height={220}>
        <defs>
          <radialGradient id="fasg" cx={`${beamX}%`} cy="50%" r="0.4">
            <stop offset="0%" stopColor="oklch(0.85 0.18 30)" stopOpacity={1} />
            <stop offset="100%" stopColor="oklch(0.55 0.19 28)" stopOpacity={0.3} />
          </radialGradient>
          <linearGradient id="fasg-base" x1={0} y1={0} x2={0} y2={1}>
            <stop offset="0%" stopColor="oklch(0.5 0.16 30)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="oklch(0.5 0.16 30)" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <g stroke="url(#fasg-base)" strokeWidth={4} fill="none" strokeLinecap="round">
          <path d="M 45 150 Q 70 60 180 65" />
          <path d="M 55 170 Q 90 90 195 95" />
          <path d="M 65 190 Q 110 120 205 130" />
        </g>
        <g stroke="url(#fasg)" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9}>
          <path d="M 45 150 Q 70 60 180 65" />
          <path d="M 55 170 Q 90 90 195 95" />
          <path d="M 65 190 Q 110 120 205 130" />
        </g>
        <circle cx={110} cy={110} r={4} fill="var(--db-red)" />
        <circle cx={110} cy={110} r={10} fill="none" stroke="var(--db-red)" strokeOpacity={0.3} />
      </svg>
    </div>
  );
}
