"use client";

import { useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { SectionCard, Icon } from "@/components/dashboard";
import { formatDate, formatPrice } from "@/lib/dashboard/format";
import type { AssistantResponse } from "@/types/assistant";
import type { Plan } from "./use-assistant";

const REGION_LABELS: Record<string, string> = {
  fsn1: "Falkenstein",
  nbg1: "Nuremberg",
  hel1: "Helsinki",
};

function HetznerFact({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </>
  );
}

export function SidebarFacts({ a, plan }: { a: AssistantResponse; plan: Plan | null }) {
  const hetzner = plan?.providerSpec as
    | { hetzner?: { serverType?: string; cpu?: string; mem?: string; disk?: string } }
    | undefined;
  const spec = hetzner?.hetzner;

  return (
    <>
      <SectionCard title="Configuration">
        <dl className="kv">
          <HetznerFact label="Plan">
            {plan?.displayName ?? "—"}
            <span className="faint" style={{ marginLeft: 8 }}>
              {plan ? `${formatPrice(plan.priceCents, plan.currency)}/mo` : null}
            </span>
          </HetznerFact>
          {spec?.serverType ? <HetznerFact label="Server type" mono>{spec.serverType}</HetznerFact> : null}
          {spec?.cpu ? <HetznerFact label="vCPU" mono>{spec.cpu}</HetznerFact> : null}
          {spec?.mem ? <HetznerFact label="Memory" mono>{spec.mem}</HetznerFact> : null}
          {spec?.disk ? <HetznerFact label="Disk" mono>{spec.disk}</HetznerFact> : null}
          <HetznerFact label="Region">
            {REGION_LABELS[a.region] ?? a.region}{" "}
            <span className="faint mono">({a.region})</span>
          </HetznerFact>
          <HetznerFact label="Provider">
            <span className="mono">{a.provider}</span>
          </HetznerFact>
          <HetznerFact label="Access">{a.accessMode === "ssh" ? "SSH tunnel" : "Tailscale Serve"}</HetznerFact>
          <HetznerFact label="Created">{formatDate(a.createdAt)}</HetznerFact>
        </dl>
      </SectionCard>

      <GatewayTokenCard assistantId={a.id} disabled={a.status !== "active"} />
    </>
  );
}

function GatewayTokenCard({ assistantId, disabled }: { assistantId: string; disabled: boolean }) {
  const rpc = useRpc();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadToken() {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"]["gateway-token"].$get({
        param: { id: assistantId },
      });
      if (res.ok) {
        const data = (await res.json()) as { token: string };
        setToken(data.token);
        setRevealed(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!token) await loadToken();
    if (token) {
      await navigator.clipboard?.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }

  if (disabled) return null;

  const display = token
    ? revealed
      ? token
      : `${token.slice(0, 8)}${"•".repeat(Math.max(0, token.length - 8))}`
    : "cbt_•••••••••••••••••••••••••";

  return (
    <SectionCard title="Gateway token" sub="Authenticates API calls to OpenClaw">
      <div className="codeblock" style={{ fontSize: 11 }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{display}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={token ? () => setRevealed((v) => !v) : loadToken}
          disabled={loading}
          title={revealed ? "Hide" : "Reveal"}
        >
          <Icon name={revealed ? "eyeOff" : "eye"} size={12} />
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={copy} title="Copy">
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
      </div>
    </SectionCard>
  );
}
