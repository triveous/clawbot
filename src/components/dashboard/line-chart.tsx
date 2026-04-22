"use client";

import { useRef, useState } from "react";

export type ChartSeries = {
  key: string;
  label: string;
  points: number[];
  color: string;
  unit?: string;
};

function smoothPath(pts: readonly (readonly [number, number])[], tension = 0.35) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + ((p2[0] - p0[0]) * tension) / 2;
    const cp1y = p1[1] + ((p2[1] - p0[1]) * tension) / 2;
    const cp2x = p2[0] - ((p3[0] - p1[0]) * tension) / 2;
    const cp2y = p2[1] - ((p3[1] - p1[1]) * tension) / 2;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function LineChart({
  series,
  timeLabels,
  yMax,
  yMin = 0,
  unit = "%",
  height = 220,
  showStats = true,
  smooth = true,
  showArea = true,
  showDots = false,
  title,
}: {
  series: ChartSeries[];
  timeLabels?: string[];
  yMax?: number;
  yMin?: number;
  unit?: string;
  height?: number;
  showStats?: boolean;
  smooth?: boolean;
  showArea?: boolean;
  showDots?: boolean;
  title?: string;
}) {
  const W = 780;
  const H = height;
  const padL = 44;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = Math.max(1, series[0]?.points.length ?? 0);
  const step = innerW / Math.max(1, n - 1);
  const allVals = series.flatMap((s) => s.points);
  const autoMax = Math.max(...allVals, 1);
  const max = yMax ?? (unit === "%" ? 100 : Math.ceil((autoMax * 1.15) / 10) * 10);
  const min = yMin;
  const yFor = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;
  const xFor = (i: number) => padL + i * step;

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    if (x < padL || x > W - padR) {
      setHover(null);
      return;
    }
    const i = Math.max(0, Math.min(n - 1, Math.round((x - padL) / step)));
    setHover(i);
  };

  const rows = 4;
  const yTicks: number[] = [];
  for (let i = 0; i <= rows; i++) yTicks.push(max - (i * (max - min)) / rows);

  const xTickCount = Math.min(6, n);
  const xTickIdx: number[] = [];
  for (let i = 0; i < xTickCount; i++) xTickIdx.push(Math.round((i * (n - 1)) / (xTickCount - 1)));

  return (
    <div className="chart chart--v2">
      {title ? (
        <div className="chart__head">
          <div className="chart__title">{title}</div>
          {series.length > 1 ? (
            <div className="chart__legend">
              {series.map((s) => (
                <div key={s.key} className="chart__legend-item">
                  <span className="sw" style={{ background: s.color }} />
                  {s.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showStats ? (
        <div className="chart__stats">
          {series.map((s) => {
            const pts = s.points;
            const cur = pts[pts.length - 1] ?? 0;
            const avg = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
            const mn = pts.length ? Math.min(...pts) : 0;
            const mx = pts.length ? Math.max(...pts) : 0;
            const u = s.unit ?? unit;
            return (
              <div key={s.key} className="chart__stat">
                <div className="chart__stat-label">
                  <span className="sw" style={{ background: s.color }} />
                  {s.label}
                </div>
                <div className="chart__stat-grid">
                  <div>
                    <span className="k">cur</span>
                    <span className="v">{cur.toFixed(1) + u}</span>
                  </div>
                  <div>
                    <span className="k">avg</span>
                    <span className="v">{avg.toFixed(1) + u}</span>
                  </div>
                  <div>
                    <span className="k">min</span>
                    <span className="v">{mn.toFixed(1) + u}</span>
                  </div>
                  <div>
                    <span className="k">max</span>
                    <span className="v">{mx.toFixed(1) + u}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1={0} y1={0} x2={0} y2={1}>
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={`g${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="oklch(1 0 0 / 0.06)"
                strokeWidth={1}
                strokeDasharray={i === rows ? "0" : "2 4"}
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--muted-foreground)"
                fontFamily="var(--font-geist-mono)"
              >
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {xTickIdx.map((idx, i) => {
          const x = xFor(idx);
          return (
            <text
              key={`x${i}`}
              x={x}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted-foreground)"
              fontFamily="var(--font-geist-mono)"
            >
              {(timeLabels && timeLabels[idx]) ?? ""}
            </text>
          );
        })}

        {series.map((s) => {
          const pts = s.points.map((v, i) => [xFor(i), yFor(v)] as const);
          if (pts.length === 0) return null;
          const line = smooth
            ? smoothPath(pts)
            : pts
                .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2))
                .join(" ");
          const last = pts[pts.length - 1];
          const first = pts[0];
          const area = `${line} L${last[0]},${padT + innerH} L${first[0]},${padT + innerH} Z`;
          return (
            <g key={s.key}>
              {showArea ? <path d={area} fill={`url(#grad-${s.key})`} /> : null}
              <path d={line} stroke={s.color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {showDots
                ? pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill={s.color} opacity={0.7} />)
                : null}
              <circle cx={last[0]} cy={last[1]} r={3.5} fill={s.color} />
              <circle cx={last[0]} cy={last[1]} r={7} fill={s.color} opacity={0.2} />
            </g>
          );
        })}

        {hover != null ? (
          <g>
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={padT}
              y2={padT + innerH}
              stroke="oklch(1 0 0 / 0.2)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={xFor(hover)}
                cy={yFor(s.points[hover] ?? 0)}
                r={4}
                fill="var(--background)"
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
            {(() => {
              const tx = xFor(hover);
              const tw = 160;
              const th = 22 + series.length * 18;
              const left = tx + tw + 12 > W - padR ? tx - tw - 12 : tx + 12;
              const top = padT + 4;
              return (
                <g>
                  <rect
                    x={left}
                    y={top}
                    width={tw}
                    height={th}
                    rx={8}
                    fill="oklch(0.12 0.012 40 / 0.96)"
                    stroke="oklch(1 0 0 / 0.12)"
                  />
                  <text
                    x={left + 10}
                    y={top + 14}
                    fontSize={10}
                    fill="var(--muted-foreground)"
                    fontFamily="var(--font-geist-mono)"
                  >
                    {(timeLabels && timeLabels[hover]) ?? `t=${hover}`}
                  </text>
                  {series.map((s, i) => (
                    <g key={s.key} transform={`translate(${left + 10}, ${top + 32 + i * 18})`}>
                      <rect x={0} y={-7} width={8} height={8} rx={2} fill={s.color} />
                      <text x={14} y={0} fontSize={11} fill="var(--muted-foreground)">
                        {s.label}
                      </text>
                      <text
                        x={tw - 20}
                        y={0}
                        textAnchor="end"
                        fontSize={11}
                        fill="var(--foreground)"
                        fontFamily="var(--font-geist-mono)"
                      >
                        {(s.points[hover] ?? 0).toFixed(1) + (s.unit ?? unit)}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
