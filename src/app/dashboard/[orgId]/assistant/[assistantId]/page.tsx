"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssistantResponse } from "@/types/assistant";

type MetricPoint = [number, number]; // [timestamp, value]

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  creating: "secondary",
  stopped: "outline",
  error: "destructive",
};

function Sparkline({ data, label }: { data: MetricPoint[]; label: string }) {
  if (!data.length) {
    return <span className="text-xs text-muted-foreground">No data</span>;
  }
  const W = 160;
  const H = 36;
  const values = data.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const last = values[values.length - 1];

  const points = data
    .map(([, v], i) => {
      const x = (i / Math.max(data.length - 1, 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="flex items-center gap-3">
      <svg width={W} height={H} className="shrink-0 overflow-visible text-primary">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
      </svg>
      <div className="text-right">
        <p className="text-sm font-medium">{last.toFixed(1)}%</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function AssistantDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; assistantId: string }>;
}) {
  const { orgId, assistantId } = use(params);
  const router = useRouter();
  const rpc = useRpc();

  const [assistant, setAssistant] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Access section
  const [sshAllowedIps, setSshAllowedIps] = useState("");
  const [savingFirewall, setSavingFirewall] = useState(false);
  const [firewallMsg, setFirewallMsg] = useState("");

  // Connect section
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);

  // Metrics section
  const [cpuSeries, setCpuSeries] = useState<MetricPoint[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Danger zone
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].$get({
        param: { id: assistantId },
      });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) return;
      const data = (await res.json()) as AssistantResponse;
      setAssistant(data);
      setSshAllowedIps(data.sshAllowedIps ?? "");
    } finally {
      setLoading(false);
    }
  }, [rpc, assistantId]);

  const loadGatewayToken = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"]["gateway-token"].$get({
        param: { id: assistantId },
      });
      if (res.ok) {
        const data = (await res.json()) as { token: string };
        setGatewayToken(data.token);
      }
    } catch {
      // token not available yet — silently ignore
    }
  }, [rpc, assistantId]);

  const loadMetrics = useCallback(async () => {
    if (!assistant?.instanceId) return;
    setMetricsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].metrics.$get({
        param: { id: assistantId },
        query: { type: "cpu", window: "1h" },
      });
      if (res.ok) {
        const data = (await res.json()) as { series: Record<string, MetricPoint[]> };
        const series = Object.values(data.series)[0] ?? [];
        setCpuSeries(series);
      }
    } finally {
      setMetricsLoading(false);
    }
  }, [rpc, assistantId, assistant?.instanceId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (assistant?.status === "active") {
      loadMetrics();
      loadGatewayToken();
    }
  }, [assistant?.status, loadMetrics, loadGatewayToken]);

  async function saveFirewall() {
    if (!sshAllowedIps.trim()) return;
    setSavingFirewall(true);
    setFirewallMsg("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].firewall.$patch({
        param: { id: assistantId },
        json: { sshAllowedIps: sshAllowedIps.trim() },
      });
      if (res.ok) {
        setFirewallMsg("Saved");
        await load();
      } else {
        const err = (await res.json()) as { message?: string };
        setFirewallMsg(err.message ?? "Failed to save");
      }
    } catch {
      setFirewallMsg("Failed to save");
    } finally {
      setSavingFirewall(false);
    }
  }

  async function deleteAssistant() {
    if (!confirm(`Delete "${assistant?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].$delete({ param: { id: assistantId } });
      router.push(`/dashboard/${orgId}`);
    } catch {
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (notFound) return <p className="text-sm text-muted-foreground">Assistant not found.</p>;
  if (!assistant) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{assistant.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[assistant.status] ?? "outline"}>
              {assistant.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{assistant.region}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/${orgId}`)}>
          ← Back
        </Button>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {assistant.hostname && (
            <div>
              <p className="text-xs text-muted-foreground">Hostname</p>
              <p className="font-mono">{assistant.hostname}</p>
            </div>
          )}
          {assistant.ipv4 && (
            <div>
              <p className="text-xs text-muted-foreground">IP</p>
              <p className="font-mono">
                {assistant.ipv4}
                {assistant.gatewayPort ? `:${assistant.gatewayPort}` : ""}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Access mode</p>
            <p>{assistant.accessMode === "ssh" ? "SSH Tunnel" : "Tailscale (Serve)"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p>{assistant.provider}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p>{new Date(assistant.createdAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      {/* Access */}
      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
        </CardHeader>
        <CardContent>
          {assistant.accessMode === "ssh" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <a
                  href={`/api/assistants/${assistantId}/ssh-key`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  ↓ Download SSH private key (.pem)
                </a>
                <p className="text-xs text-muted-foreground">
                  chmod 400 the file before use: <code className="font-mono">ssh -i key.pem root@{assistant.ipv4 ?? "&lt;ip&gt;"}</code>
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Comma-separated CIDRs allowed to reach port 22.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="fw-ips">Allowed IPs</Label>
                    <Input
                      id="fw-ips"
                      value={sshAllowedIps}
                      onChange={(e) => { setSshAllowedIps(e.target.value); setFirewallMsg(""); }}
                      placeholder="0.0.0.0/0, ::/0"
                      className="w-72"
                    />
                  </div>
                  <Button
                    onClick={saveFirewall}
                    disabled={savingFirewall || !sshAllowedIps.trim()}
                    size="sm"
                  >
                    {savingFirewall ? "Saving…" : "Save"}
                  </Button>
                </div>
                {firewallMsg && (
                  <p className={`text-xs mt-1 ${firewallMsg === "Saved" ? "text-green-600" : "text-destructive"}`}>
                    {firewallMsg}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tailscale access is configured at provisioning time. To change the auth key,
              delete and recreate this assistant — your credit will be released.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Connect */}
      {assistant.status === "active" && (
        <Card>
          <CardHeader>
            <CardTitle>Connect to Gateway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {assistant.accessMode === "ssh" ? (
              <>
                {assistant.ipv4 && assistant.gatewayPort ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        1. Open an SSH tunnel (keep this terminal open):
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                          {`ssh -i ${assistant.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pem -N -L 8888:localhost:${assistant.gatewayPort} root@${assistant.ipv4}`}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              `ssh -i ${assistant.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pem -N -L 8888:localhost:${assistant.gatewayPort} root@${assistant.ipv4}`
                            ).then(() => { setCmdCopied(true); setTimeout(() => setCmdCopied(false), 2000); });
                          }}
                        >
                          {cmdCopied ? "Copied!" : "Copy"}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        2. Open your gateway in a browser:
                      </p>
                      <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
                        http://localhost:8888
                      </code>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">Waiting for server to come online…</p>
                )}
              </>
            ) : (
              <>
                {assistant.hostname ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Your gateway is served over Tailscale:
                    </p>
                    <a
                      href={`https://${assistant.hostname}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                    >
                      https://{assistant.hostname}
                    </a>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">Waiting for Tailscale hostname…</p>
                )}
              </>
            )}

            {/* Gateway token */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Gateway token:</p>
              {gatewayToken ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                    {tokenRevealed ? gatewayToken : `${gatewayToken.slice(0, 8)}${"•".repeat(Math.max(0, gatewayToken.length - 8))}`}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setTokenRevealed((v) => !v)}
                  >
                    {tokenRevealed ? "Hide" : "Reveal"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(gatewayToken).then(() => {
                        setTokenCopied(true);
                        setTimeout(() => setTokenCopied(false), 2000);
                      });
                    }}
                  >
                    {tokenCopied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Token not available yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      {assistant.status === "active" && (
        <Card>
          <CardHeader>
            <CardTitle>Metrics (1h)</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : cpuSeries.length > 0 ? (
              <Sparkline data={cpuSeries} label="CPU (1h)" />
            ) : (
              <p className="text-sm text-muted-foreground">No metrics available yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete this assistant</p>
            <p className="text-xs text-muted-foreground">
              Destroys the VPS and releases the credit back to your org.
            </p>
          </div>
          <Button variant="destructive" onClick={deleteAssistant} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
