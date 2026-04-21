"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssistantResponse, AccessMode } from "@/types/assistant";

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
};

type Credit = {
  status: string;
  consumedByAssistantId: string | null;
  currentPeriodEnd: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  creating: "secondary",
  stopped: "outline",
  error: "destructive",
};

const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  ssh: "SSH",
  tailscale_serve: "Tailscale",
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export default function DashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();

  const [assistants, setAssistants] = useState<AssistantResponse[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [region, setRegion] = useState("fsn1");
  const [accessMode, setAccessMode] = useState<AccessMode>("ssh");
  const [sshAllowedIps, setSshAllowedIps] = useState("");
  const [tailscaleAuthKey, setTailscaleAuthKey] = useState("");
  const [tsVerified, setTsVerified] = useState(false);
  const [tsVerifying, setTsVerifying] = useState(false);
  const [tsError, setTsError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [aRes, pRes, cRes] = await Promise.all([
        rpc.api.assistants.$get(),
        rpc.api.plans.$get(),
        rpc.api.credits.$get(),
      ]);
      if (aRes.ok) {
        const d = (await aRes.json()) as { assistants: AssistantResponse[] };
        setAssistants(d.assistants);
      }
      if (pRes.ok) {
        const d = (await pRes.json()) as { plans: Plan[] };
        setPlans(d.plans);
        if (d.plans.length > 0 && !planId) setPlanId(d.plans[0].id);
      }
      if (cRes.ok) {
        const d = (await cRes.json()) as { credits: Credit[] };
        setCredits(d.credits);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc, planId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const availableCredits = credits.filter(
    (c) =>
      c.status === "active" &&
      !c.consumedByAssistantId &&
      c.currentPeriodEnd &&
      new Date(c.currentPeriodEnd) > new Date(),
  );

  async function verifyTailscaleKey() {
    if (!tailscaleAuthKey.trim()) return;
    setTsVerifying(true);
    setTsError("");
    setTsVerified(false);
    try {
      const res = await rpc.api.tailscale.verify.$post({
        json: { authKey: tailscaleAuthKey.trim() },
      });
      const data = (await res.json()) as { valid: boolean; expiresAt?: string | null };
      if (res.ok && data.valid) {
        setTsVerified(true);
      } else {
        setTsError("Key is invalid or expired");
      }
    } catch {
      setTsError("Failed to verify key");
    } finally {
      setTsVerifying(false);
    }
  }

  async function create() {
    if (!name.trim() || !planId) return;
    if (accessMode === "tailscale_serve" && !tsVerified) {
      setCreateError("Verify your Tailscale auth key first");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const body: Record<string, string> = { name: name.trim(), planId, region, accessMode };
      if (sshAllowedIps.trim()) body.sshAllowedIps = sshAllowedIps.trim();
      if (accessMode === "tailscale_serve") body.tailscaleAuthKey = tailscaleAuthKey.trim();

      const res = await rpc.api.assistants.$post({ json: body });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setCreateError(err.message ?? "Failed to create assistant");
        return;
      }
      setName("");
      setTailscaleAuthKey("");
      setSshAllowedIps("");
      setTsVerified(false);
      await loadAll();
    } catch {
      setCreateError("Failed to create assistant");
    } finally {
      setCreating(false);
    }
  }

  async function retry(id: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].retry.$post({ param: { id } });
      await loadAll();
    } catch {
      // ignore
    }
  }

  async function del(id: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].$delete({ param: { id } });
      await loadAll();
    } catch {
      // ignore
    }
  }

  const selectedPlan = plans.find((p) => p.id === planId);
  const canCreate =
    !!name.trim() &&
    !!planId &&
    (accessMode !== "tailscale_serve" || tsVerified);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assistants</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {availableCredits.length} credit{availableCredits.length !== 1 ? "s" : ""} available ·{" "}
            <Link href={`/dashboard/${orgId}/credits`} className="underline">
              {credits.length} total
            </Link>
          </p>
        </div>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>New Assistant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="assistant-name">Name</Label>
              <Input
                id="assistant-name"
                placeholder="My assistant"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                className="w-48"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="plan">Plan</Label>
              {plans.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1.5">No plans — ask admin</p>
              ) : (
                <select
                  id="plan"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} — {formatPrice(p.priceCents, p.currency)}/mo
                    </option>
                  ))}
                </select>
              )}
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
              <Label htmlFor="access-mode">Access</Label>
              <select
                id="access-mode"
                value={accessMode}
                onChange={(e) => {
                  setAccessMode(e.target.value as AccessMode);
                  setTsVerified(false);
                  setTsError("");
                }}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="ssh">SSH</option>
                <option value="tailscale_serve">Tailscale</option>
              </select>
            </div>

            {accessMode === "ssh" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="ssh-allowed-ips">Allowed IPs</Label>
                <Input
                  id="ssh-allowed-ips"
                  placeholder="0.0.0.0/0"
                  value={sshAllowedIps}
                  onChange={(e) => setSshAllowedIps(e.target.value)}
                  className="w-36"
                />
              </div>
            )}

            {accessMode === "tailscale_serve" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="ts-auth-key">Tailscale Auth Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="ts-auth-key"
                    type="password"
                    placeholder="tskey-auth-…"
                    value={tailscaleAuthKey}
                    onChange={(e) => {
                      setTailscaleAuthKey(e.target.value);
                      setTsVerified(false);
                      setTsError("");
                    }}
                    className="w-44"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={verifyTailscaleKey}
                    disabled={tsVerifying || !tailscaleAuthKey.trim()}
                  >
                    {tsVerifying ? "…" : tsVerified ? "✓ Valid" : "Verify"}
                  </Button>
                </div>
                {tsError && <p className="text-xs text-destructive">{tsError}</p>}
              </div>
            )}

            <Button onClick={create} disabled={creating || !canCreate || plans.length === 0}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>

          {selectedPlan?.tagline && (
            <p className="text-xs text-muted-foreground">{selectedPlan.tagline}</p>
          )}
          {availableCredits.length === 0 && plans.length > 0 && (
            <p className="text-xs text-amber-600">
              No available credit for this plan.{" "}
              <Link href={`/dashboard/${orgId}/credits`} className="underline">
                View credits
              </Link>
            </p>
          )}
          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </CardContent>
      </Card>

      {/* Assistant list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assistants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assistants yet.</p>
      ) : (
        <div className="space-y-2">
          {assistants.map((a) => {
            const plan = plans.find((p) => p.id === a.planId);
            return (
              <Card
                key={a.id}
                className={a.status === "error" ? "border-destructive" : ""}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <Badge variant={STATUS_VARIANT[a.status] ?? "outline"}>
                        {a.status}
                      </Badge>
                      <Link
                        href={`/dashboard/${orgId}/assistant/${a.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      {plan && (
                        <Badge variant="outline" className="text-xs">
                          {plan.displayName}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{a.region}</span>
                      <span className="text-xs text-muted-foreground">
                        {ACCESS_MODE_LABELS[a.accessMode] ?? a.accessMode}
                      </span>
                      {a.ipv4 && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {a.ipv4}
                          {a.gatewayPort ? `:${a.gatewayPort}` : ""}
                        </span>
                      )}
                      {a.hostname && (
                        <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                          {a.hostname}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {a.status === "error" && (
                        <Button variant="outline" size="sm" onClick={() => retry(a.id)}>
                          Retry
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => del(a.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  {a.status === "error" && a.lastErrorAt && (
                    <p className="mt-2 text-xs text-destructive">
                      Failed {new Date(a.lastErrorAt).toLocaleString()} ·{" "}
                      <Link
                        href={`/dashboard/${orgId}/assistant/${a.id}`}
                        className="underline"
                      >
                        details
                      </Link>
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
