export function Sparkline({
  points,
  color = "currentColor",
  w = 120,
  h = 36,
  fill = false,
}: {
  points: number[];
  color?: string;
  w?: number;
  h?: number;
  fill?: boolean;
}) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / Math.max(1, points.length - 1);
  const pts = points.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2] as const);
  const d = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1))
    .join(" ");
  const fillD = fill ? `${d} L${w},${h} L0,${h} Z` : null;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ color }}>
      {fill && fillD ? <path d={fillD} fill="currentColor" fillOpacity={0.12} /> : null}
      <path d={d} stroke="currentColor" strokeWidth={1.5} fill="none" />
    </svg>
  );
}
