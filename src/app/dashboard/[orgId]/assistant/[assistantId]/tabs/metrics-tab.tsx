"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import {
  SectionCard,
  MetricLineChart,
  Segmented,
  Icon,
  type MetricSeries,
} from "@/components/dashboard";
import { Spinner } from "@/components/ui/spinner";
import { makeTrace, formatTimeLabels } from "@/lib/dashboard/traces";
import type { AssistantResponse } from "@/types/assistant";

type Window = "15m" | "1h" | "6h" | "24h" | "7d";
type MetricPoint = [number, number];

const WINDOW_OPTIONS = [
  { value: "15m" as const, label: "15m" },
  { value: "1h" as const, label: "1h" },
  { value: "6h" as const, label: "6h" },
  { value: "24h" as const, label: "24h" },
  { value: "7d" as const, label: "7d" },
];

// All chart colours come from the shadcn theme tokens so light/dark swap is
// automatic and the Monitor palette matches the rest of the dashboard.
const COLOR = {
  cpu: "var(--chart-1)", // OpenClaw red (primary)
  mem: "var(--chart-2)", // cool blue
  netIn: "var(--chart-3)", // green
  netOut: "var(--chart-2)",
  req: "var(--chart-4)", // amber
} as const;

function Stat({
  label,
  values,
  unit,
  color,
}: {
  label: string;
  values: number[];
  unit: string;
  color: string;
}) {
  if (values.length === 0) {
    return (
      <div className="chart__stat">
        <div className="chart__stat-label">
          <span className="sw" style={{ background: color }} />
          {label}
        </div>
        <div className="chart__stat-grid">
          <div>
            <span className="k">cur</span>
            <span className="v">—</span>
          </div>
        </div>
      </div>
    );
  }
  const cur = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  return (
    <div className="chart__stat">
      <div className="chart__stat-label">
        <span className="sw" style={{ background: color }} />
        {label}
      </div>
      <div className="chart__stat-grid">
        <div>
          <span className="k">cur</span>
          <span className="v">{cur.toFixed(1)}{unit}</span>
        </div>
        <div>
          <span className="k">avg</span>
          <span className="v">{avg.toFixed(1)}{unit}</span>
        </div>
        <div>
          <span className="k">min</span>
          <span className="v">{mn.toFixed(1)}{unit}</span>
        </div>
        <div>
          <span className="k">max</span>
          <span className="v">{mx.toFixed(1)}{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function MetricsTab({ a }: { a: AssistantResponse }) {
  const rpc = useRpc();
  const [window, setWindowVal] = useState<Window>("1h");
  const [cpu, setCpu] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCpu = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].metrics.$get({
        param: { id: a.id },
        query: { type: "cpu", window },
      });
      if (res.ok) {
        const data = (await res.json()) as { series: Record<string, MetricPoint[]> };
        const pts = Object.values(data.series)[0] ?? [];
        setCpu(pts.map(([, v]) => v));
      }
    } finally {
      setLoading(false);
    }
  }, [rpc, a.id, window]);

  useEffect(() => {
    void loadCpu();
  }, [loadCpu]);

  const cpuValues = cpu.length ? cpu : makeTrace(30, 36, 18, 1);
  const memValues = useMemo(() => makeTrace(50, 36, 8, 2), []);
  const netInValues = useMemo(() => makeTrace(15, 36, 20, 3), []);
  const netOutValues = useMemo(() => makeTrace(25, 36, 30, 4), []);
  const reqValues = useMemo(() => makeTrace(45, 36, 25, 5), []);

  const labels = useMemo(() => formatTimeLabels(window, 36), [window]);

  const cpuSeries: MetricSeries[] = [
    { key: "cpu", label: "CPU", color: COLOR.cpu, points: cpuValues, unit: "%" },
  ];
  const memSeries: MetricSeries[] = [
    { key: "mem", label: "RAM", color: COLOR.mem, points: memValues, unit: "%" },
  ];
  const netSeries: MetricSeries[] = [
    { key: "in", label: "Ingress", color: COLOR.netIn, points: netInValues, unit: " MB/s" },
    { key: "out", label: "Egress", color: COLOR.netOut, points: netOutValues, unit: " MB/s" },
  ];
  const reqSeries: MetricSeries[] = [
    { key: "r", label: "Requests", color: COLOR.req, points: reqValues, unit: "/min" },
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Segmented value={window} onChange={setWindowVal} options={WINDOW_OPTIONS} />
        <div className="flex-spacer" />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => void loadCpu()}
          title="Refresh metrics"
          disabled={loading}
          aria-busy={loading || undefined}
        >
          {loading ? <Spinner size="xs" /> : <Icon name="refresh" size={14} />}
          Refresh
        </button>
      </div>

      <SectionCard title="CPU usage">
        <div className="chart__stats" style={{ marginBottom: 16 }}>
          <Stat label="CPU" values={cpuValues} unit="%" color={COLOR.cpu} />
        </div>
        <MetricLineChart series={cpuSeries} timeLabels={labels} unit="%" yMax={100} height={240} />
        {cpu.length === 0 && !loading ? (
          <div className="faint" style={{ fontSize: 11, marginTop: 8, fontFamily: "var(--font-geist-mono)" }}>
            no server data yet — showing preview trace
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Network throughput · preview">
        <div className="chart__stats" style={{ marginBottom: 16 }}>
          <Stat label="Ingress" values={netInValues} unit=" MB/s" color={COLOR.netIn} />
          <Stat label="Egress" values={netOutValues} unit=" MB/s" color={COLOR.netOut} />
        </div>
        <MetricLineChart series={netSeries} timeLabels={labels} unit=" MB/s" height={240} legend />
      </SectionCard>

      <SectionCard title="Memory · preview">
        <div className="chart__stats" style={{ marginBottom: 16 }}>
          <Stat label="RAM" values={memValues} unit="%" color={COLOR.mem} />
        </div>
        <MetricLineChart series={memSeries} timeLabels={labels} unit="%" yMax={100} height={200} />
      </SectionCard>

      <SectionCard title="Requests per minute · preview">
        <div className="chart__stats" style={{ marginBottom: 16 }}>
          <Stat label="Requests" values={reqValues} unit="/min" color={COLOR.req} />
        </div>
        <MetricLineChart series={reqSeries} timeLabels={labels} unit="/min" height={200} />
      </SectionCard>
    </div>
  );
}
