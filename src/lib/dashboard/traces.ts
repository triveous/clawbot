// Deterministic-ish noise generator for metric traces used by the dashboard
// preview + stubbed metrics. Real series come from the Hetzner metrics API;
// this fills in the gap where no server data is available yet so the UI still
// renders a realistic curve instead of a flat line.

export function makeTrace(base: number, count = 30, jitter = 10, seed = 1): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < count; i++) {
    const k = (i + 1) * (seed + 1);
    const noise = Math.sin(k * 0.37) * Math.cos(k * 1.13) + Math.sin(k * 2.1) * 0.5;
    v = v + noise * jitter * 0.3 + Math.sin(i * 0.4 + seed) * jitter * 0.1;
    v = Math.max(2, Math.min(98, v));
    out.push(v);
  }
  return out;
}

export function formatTimeLabels(window: "15m" | "1h" | "6h" | "24h" | "7d", count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const frac = i / Math.max(1, count - 1);
    switch (window) {
      case "15m":
        out.push(`-${Math.round((1 - frac) * 15)}m`);
        break;
      case "1h":
        out.push(`-${Math.round((1 - frac) * 60)}m`);
        break;
      case "6h": {
        const h = (1 - frac) * 6;
        out.push(h < 1 ? `-${Math.round(h * 60)}m` : `-${h.toFixed(1)}h`);
        break;
      }
      case "24h":
        out.push(`-${Math.round((1 - frac) * 24)}h`);
        break;
      case "7d":
        out.push(`-${((1 - frac) * 7).toFixed(1)}d`);
        break;
    }
  }
  return out;
}
