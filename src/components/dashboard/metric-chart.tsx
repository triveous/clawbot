"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type MetricSeries = {
  key: string;
  label: string;
  points: number[];
  color: string;
  unit?: string;
};

export function MetricLineChart({
  series,
  timeLabels,
  unit = "%",
  yMax,
  height = 220,
  area = true,
  legend,
}: {
  series: MetricSeries[];
  timeLabels?: string[];
  unit?: string;
  yMax?: number;
  height?: number;
  area?: boolean;
  legend?: boolean;
}) {
  if (series.length === 0) return null;

  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  const n = series[0]?.points.length ?? 0;
  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | string> = { idx: i };
    row.label = timeLabels?.[i] ?? "";
    for (const s of series) {
      row[s.key] = s.points[i] ?? 0;
    }
    return row;
  });

  const allValues = series.flatMap((s) => s.points);
  const computedMax =
    yMax ?? (unit === "%" ? 100 : Math.max(...allValues, 1) * 1.15);

  const Chart = area ? AreaChart : RechartsLineChart;

  return (
    <ChartContainer
      config={config}
      className="w-full"
      style={{ height }}
    >
      <Chart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)", fontSize: 10 }}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tick={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)", fontSize: 10 }}
          domain={[0, computedMax]}
          tickFormatter={(v) => String(Math.round(Number(v)))}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", opacity: 0.6 }}
          content={
            <ChartTooltipContent
              labelKey="label"
              indicator="line"
              formatter={(value, name) => {
                const s = series.find((x) => x.key === name);
                const u = s?.unit ?? unit;
                const num = typeof value === "number" ? value : Number(value);
                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{s?.label ?? name}</span>
                    <span className="font-mono tabular-nums">{num.toFixed(1)}{u}</span>
                  </div>
                );
              }}
            />
          }
        />
        {legend && series.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {series.map((s) =>
          area ? (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={1.75}
              fill={`url(#fill-${s.key})`}
              activeDot={{ r: 4, strokeWidth: 0, fill: s.color }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: s.color }}
              isAnimationActive={false}
            />
          ),
        )}
      </Chart>
    </ChartContainer>
  );
}
