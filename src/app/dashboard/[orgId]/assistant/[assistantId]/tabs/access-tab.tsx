"use client";

import { useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { SectionCard, Field, Callout, Pill, Icon } from "@/components/dashboard";
import type { AssistantResponse } from "@/types/assistant";

export function AccessTab({
  a,
  onUpdated,
}: {
  a: AssistantResponse;
  onUpdated: () => Promise<void>;
}) {
  if (a.accessMode === "ssh") return <SshAccess a={a} onUpdated={onUpdated} />;
  return <TailscaleAccess a={a} />;
}

function SshAccess({
  a,
  onUpdated,
}: {
  a: AssistantResponse;
  onUpdated: () => Promise<void>;
}) {
  const rpc = useRpc();
  const [ips, setIps] = useState(a.sshAllowedIps ?? "0.0.0.0/0");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    if (!ips.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].firewall.$patch({
        param: { id: a.id },
        json: { sshAllowedIps: ips.trim() },
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "Saved — firewall updated on Hetzner." });
        await onUpdated();
      } else {
        const err = (await res.json()) as { message?: string };
        setMsg({ kind: "err", text: err.message ?? "Failed to save" });
      }
    } catch {
      setMsg({ kind: "err", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  const keyFile = `${a.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pem`;

  return (
    <div className="col" style={{ gap: 16 }}>
      <SectionCard title="SSH key" sub="One key pair per assistant. Private key is yours to keep.">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--db-bg)",
              border: "1px solid var(--db-hair)",
              display: "grid",
              placeItems: "center",
              color: "var(--db-red)",
            }}
          >
            <Icon name="key" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{keyFile}</div>
            <div className="mono faint">ed25519 private key · stored encrypted at rest</div>
          </div>
          <a
            href={`/api/assistants/${a.id}/ssh-key`}
            download={keyFile}
            className="btn btn--ghost btn--sm"
          >
            <Icon name="download" size={14} />
            Download
          </a>
        </div>
        <div style={{ marginTop: 14 }}>
          <Callout kind="warn" icon="shield">
            <code>chmod 400 {keyFile}</code> before use. The key is decrypted server-side only
            when you download it.
          </Callout>
        </div>
      </SectionCard>

      <SectionCard title="Firewall" sub="Inbound port 22 allowlist synced to Hetzner">
        <Field
          label="Allowed IPs (CIDR, comma-separated)"
          hint="0.0.0.0/0 allows anywhere. Narrow this down if you can."
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={ips}
              onChange={(e) => {
                setIps(e.target.value);
                setMsg(null);
              }}
              style={{ flex: 1 }}
              placeholder="0.0.0.0/0"
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={save}
              disabled={saving || !ips.trim()}
            >
              <Icon name="check" size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Field>
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--db-bg-2)",
            borderRadius: 8,
            fontFamily: "var(--font-geist-mono)",
            fontSize: 11,
            color: "var(--db-text-dim)",
          }}
        >
          current · <span style={{ color: "var(--db-text)" }}>{a.sshAllowedIps ?? "0.0.0.0/0"}</span>
        </div>
        {msg ? (
          <div
            className="faint"
            style={{
              fontSize: 12,
              marginTop: 10,
              color: msg.kind === "ok" ? "var(--success)" : "var(--destructive)",
            }}
          >
            {msg.text}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function TailscaleAccess({ a }: { a: AssistantResponse }) {
  return (
    <SectionCard
      title="Tailscale Serve"
      sub="No public ports. Gateway reachable only inside your tailnet."
    >
      <dl className="kv">
        <dt>Hostname</dt>
        <dd className="mono">{a.hostname ?? "pending"}</dd>
        <dt>MagicDNS</dt>
        <dd>
          <Pill kind="active" dot>
            Enabled
          </Pill>
        </dd>
        <dt>HTTPS</dt>
        <dd>
          <Pill kind="active" dot>
            Let&rsquo;s Encrypt
          </Pill>
        </dd>
      </dl>
      <div style={{ marginTop: 14 }}>
        <Callout kind="info" icon="info">
          To rotate the Tailscale auth key, delete this assistant and recreate it — your credit
          will be released.
        </Callout>
      </div>
    </SectionCard>
  );
}
