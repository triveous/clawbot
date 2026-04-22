"use client";

import { useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { SectionCard, CodeBlock, Icon } from "@/components/dashboard";
import type { AssistantResponse } from "@/types/assistant";

export function ConnectTab({ a }: { a: AssistantResponse }) {
  const rpc = useRpc();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function ensureToken() {
    if (token) return token;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"]["gateway-token"].$get({
        param: { id: a.id },
      });
      if (res.ok) {
        const data = (await res.json()) as { token: string };
        setToken(data.token);
        return data.token;
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal() {
    await ensureToken();
    setRevealed((v) => !v);
  }

  async function handleCopy() {
    const t = await ensureToken();
    if (!t) return;
    await navigator.clipboard?.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  const keyFile = `${a.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pem`;
  const sshTunnel = `ssh -i ${keyFile} -N -L 8888:localhost:${a.gatewayPort ?? 8443} root@${a.ipv4 ?? "<ip>"}`;

  const display = token
    ? revealed
      ? token
      : `${token.slice(0, 8)}${"•".repeat(Math.max(0, token.length - 8))}`
    : "cbt_•••••••••••••••••••••••••";

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid2">
        <SectionCard title="From your terminal" sub="SSH tunnel to the gateway">
          <div className="col" style={{ gap: 10 }}>
            <CodeBlock code={`chmod 400 ${keyFile}`} />
            <CodeBlock code={sshTunnel} />
            <div className="faint" style={{ fontSize: 12 }}>
              Then open <span className="mono">http://localhost:8888</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="From the OpenClaw SDK">
          <CodeBlock
            prompt="#"
            code={`from openclaw import Claw

claw = Claw(
    gateway="http://localhost:8888",
    token=$GATEWAY_TOKEN,
)`}
          />
          <div style={{ marginTop: 10 }} className="faint" aria-live="polite">
            Set <span className="mono">$GATEWAY_TOKEN</span> to the value revealed below.
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Gateway token" sub="Authenticates API calls to your OpenClaw instance">
        <div className="codeblock">
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{display}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleReveal}
            disabled={loading}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={12} />
            {revealed ? "Hide" : "Reveal"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleCopy}
            disabled={loading}
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          Tokens are decrypted server-side on each reveal — we never cache them in the browser
          past a copy action.
        </div>
      </SectionCard>
    </div>
  );
}
