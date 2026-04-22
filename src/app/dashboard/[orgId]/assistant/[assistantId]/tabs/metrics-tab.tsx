"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { SectionCard, LineChart, Segmented, Icon, type ChartSeries } from "@/components/dashboard";
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

  const cpuSeries: ChartSeries[] = useMemo(() => {
    const values = cpu.length ? cpu : makeTrace(30, 36, 18, 1);
    return [
      {
        key: "cpu",
        label: "CPU",
        color: "var(--primary)",
        points: values,
        unit: "%",
      },
    ];
  }, [cpu]);

  // Memory / Net / Req-rate aren't exposed by our metrics API yet. Render
  // faithful traces so the tab matches the design; once the API supports them
  // we point these at real data.
  const memSeries: ChartSeries[] = useMemo(
    () => [
      {
        key: "mem",
        label: "RAM",
        color: "oklch(0.58 0.08 230)",
        points: makeTrace(50, 36, 8, 2),
        unit: "%",
      },
    ],
    [],
  );

  const netSeries: ChartSeries[] = useMemo(
    () => [
      {
        key: "in",
        label: "Ingress",
        color: "oklch(0.62 0.14 148)",
        points: makeTrace(15, 36, 20, 3),
        unit: " MB/s",
      },
      {
        key: "out",
        label: "Egress",
        color: "oklch(0.58 0.08 230)",
        points: makeTrace(25, 36, 30, 4),
        unit: " MB/s",
      },
    ],
    [],
  );

  const reqSeries: ChartSeries[] = useMemo(
    () => [
      {
        key: "r",
        label: "Requests",
        color: "oklch(0.75 0.15 75)",
        points: makeTrace(45, 36, 25, 5),
        unit: "/min",
      },
    ],
    [],
  );

  const labels = useMemo(() => formatTimeLabels(window, 36), [window]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Segmented value={window} onChange={setWindowVal} options={WINDOW_OPTIONS} />
        <div className="flex-spacer" />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={loadCpu}
          title="Refresh metrics"
        >
          <Icon name="refresh" size={14} />
          Refresh
        </button>
      </div>

      <SectionCard>
        <LineChart
          title={`CPU usage${loading ? " · loading" : ""}`}
          unit="%"
          yMax={100}
          height={240}
          timeLabels={labels}
          series={cpuSeries}
        />
        {cpu.length === 0 && !loading ? (
          <div
            className="faint"
            style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--font-geist-mono)" }}
          >
            no server data yet — showing preview trace
          </div>
        ) : null}
      </SectionCard>

      <SectionCard>
        <LineChart
          title="Network throughput · preview"
          unit=" MB/s"
          height={240}
          timeLabels={labels}
          series={netSeries}
        />
      </SectionCard>

      <SectionCard>
        <LineChart
          title="Memory · preview"
          unit="%"
          yMax={100}
          height={200}
          timeLabels={labels}
          series={memSeries}
        />
      </SectionCard>

      <SectionCard>
        <LineChart
          title="Requests per minute · preview"
          unit="/min"
          height={200}
          timeLabels={labels}
          series={reqSeries}
        />
      </SectionCard>
    </div>
  );
}
