"use client";

import { useState, useEffect, useCallback } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AssistantStatus = "creating" | "provisioning" | "running" | "stopped" | "error";
type AccessMode = "ssh" | "tailscale_serve";

type Assistant = {
  id: string;
  name: string;
  status: AssistantStatus;
  provider: string;
  ipv4: string | null;
  hostname: string | null;
  region: string;
  accessMode: AccessMode;
  gatewayPort: number | null;
  createdAt: string;
};

const STATUS_VARIANT: Record<
  AssistantStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  creating: "secondary",
  provisioning: "secondary",
  stopped: "outline",
  error: "destructive",
};

const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  ssh: "SSH Tunnel",
  tailscale_serve: "Tailscale (Serve)",
};

export default function DashboardPage() {
  const rpc = useRpc();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("fsn1");
  const [accessMode, setAccessMode] = useState<AccessMode>("ssh");
  const [sshAllowedIps, setSshAllowedIps] = useState("");
  const [tailscaleAuthKey, setTailscaleAuthKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await rpc.api.assistants.$get();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError((err as { message?: string }).message ?? "Failed to load assistants");
        setAssistants([]);
        return;
      }
      const data = (await res.json()) as { assistants?: Assistant[] };
      setAssistants(data.assistants ?? []);
    } catch {
      setError("Failed to load assistants");
      setAssistants([]);
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    const isTailscale = accessMode === "tailscale_serve";
    if (isTailscale && !tailscaleAuthKey.trim()) {
      setError("Tailscale auth key is required for Tailscale modes");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        region,
        accessMode,
      };
      if (sshAllowedIps.trim()) body.sshAllowedIps = sshAllowedIps.trim();
      if (isTailscale) body.tailscaleAuthKey = tailscaleAuthKey.trim();

      const res = await rpc.api.assistants.$post({ json: body });
      if (!res.ok) {
        const err = await res.json();
        setError((err as { message?: string }).message ?? "Failed to create assistant");
        return;
      }
      setName("");
      setTailscaleAuthKey("");
      setSshAllowedIps("");
      await load();
    } catch {
      setError("Failed to create assistant");
    } finally {
      setCreating(false);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].$delete({ param: { id } });
      await load();
    } catch {
      setError("Failed to delete assistant");
    }
  }

  const isTailscale = accessMode === "tailscale_serve";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assistants</h1>

      <Card>
        <CardHeader>
          <CardTitle>New Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="assistant-name">Name</Label>
              <Input
                id="assistant-name"
                placeholder="Assistant name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                className="w-48"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="region">Region</Label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="fsn1">fsn1 — Falkenstein</option>
                <option value="nbg1">nbg1 — Nuremberg</option>
                <option value="hel1">hel1 — Helsinki</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="access-mode">Access Mode</Label>
              <select
                id="access-mode"
                value={accessMode}
                onChange={(e) => setAccessMode(e.target.value as AccessMode)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="ssh">SSH Tunnel</option>
                <option value="tailscale_serve">Tailscale (Serve)</option>
              </select>
            </div>

            {accessMode === "ssh" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="ssh-allowed-ips">SSH Allowed IPs</Label>
                <Input
                  id="ssh-allowed-ips"
                  placeholder="0.0.0.0/0 (any)"
                  value={sshAllowedIps}
                  onChange={(e) => setSshAllowedIps(e.target.value)}
                  className="w-36"
                />
              </div>
            )}

            {isTailscale && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="ts-auth-key">Tailscale Auth Key</Label>
                <Input
                  id="ts-auth-key"
                  type="password"
                  placeholder="tskey-auth-…"
                  value={tailscaleAuthKey}
                  onChange={(e) => setTailscaleAuthKey(e.target.value)}
                  className="w-48"
                />
              </div>
            )}

            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assistants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assistants yet.</p>
      ) : (
        <div className="space-y-2">
          {assistants.map((assistant) => (
            <Card key={assistant.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={STATUS_VARIANT[assistant.status]}>
                    {assistant.status}
                  </Badge>
                  <span className="font-medium">{assistant.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {assistant.region}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ACCESS_MODE_LABELS[assistant.accessMode] ?? assistant.accessMode}
                  </span>
                  {assistant.ipv4 && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {assistant.ipv4}
                      {assistant.gatewayPort ? `:${assistant.gatewayPort}` : ""}
                    </span>
                  )}
                  {assistant.hostname && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {assistant.hostname}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(assistant.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => del(assistant.id)}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
