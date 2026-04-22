"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getSnapshots,
  triggerSnapshotBuild,
  triggerSnapshotDelete,
  getPlans,
  createPlan,
  togglePlanActive,
  updatePlan,
  getCreditsForOrg,
  mintCredit,
  revokeCredit,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Hetzner server types available on our snapshot family; labelled so the
// platform admin can pick at a glance. Centralised so the Create Plan and
// Edit Plan panels stay in sync.
const HETZNER_SERVER_TYPES: { value: string; label: string }[] = [
  { value: "cx23", label: "cx23 — 2 vCPU Intel, 4 GB, 20 GB disk" },
  { value: "cx33", label: "cx33 — 4 vCPU Intel, 8 GB, 40 GB disk" },
  { value: "cx43", label: "cx43 — 8 vCPU Intel, 16 GB, 80 GB disk" },
  { value: "cpx11", label: "cpx11 — 2 vCPU AMD, 2 GB, 80 GB disk" },
  { value: "cpx21", label: "cpx21 — 3 vCPU AMD, 4 GB, 100 GB disk" },
  { value: "cax11", label: "cax11 — 2 vCPU ARM, 4 GB, 40 GB disk" },
  { value: "cax21", label: "cax21 — 4 vCPU ARM, 8 GB, 80 GB disk" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Snapshot = {
  id: string;
  provider: string;
  providerSnapshotId: string;
  version: string;
  openclawVersion: string;
  isActive: boolean;
  createdAt: Date;
};

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  tier: number;
  isActive: boolean;
  providerSpec: Record<string, unknown>;
  billingProviderIds: Record<string, unknown>;
  benefits: string[];
  sortOrder: number;
};

type Credit = {
  id: string;
  orgId: string;
  planId: string;
  status: string;
  source: string;
  currentPeriodEnd: Date | null;
  consumedByAssistantId: string | null;
};

// ─── Snapshots panel ──────────────────────────────────────────────────────────

function SnapshotsPanel() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState("");
  const [openclawVersion, setOpenclawVersion] = useState("");
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getSnapshots();
      setSnaps(data as Snapshot[]);
    } catch {
      // snapshots panel may fail for non-admins; show empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function build() {
    if (!version.trim() || !openclawVersion.trim()) return;
    setBuilding(true);
    setError("");
    setRunId("");
    try {
      const result = await triggerSnapshotBuild(version.trim(), openclawVersion.trim());
      setRunId(result.runId);
      setVersion("");
      setOpenclawVersion("");
      await load();
    } catch { setError("Failed to start snapshot build"); }
    finally { setBuilding(false); }
  }

  async function del(snapshotId: string) {
    setDeleting(snapshotId);
    setError("");
    try { await triggerSnapshotDelete(snapshotId); await load(); }
    catch { setError("Failed to start snapshot deletion"); }
    finally { setDeleting(null); }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Snapshots</h2>
      <Card>
        <CardHeader><CardTitle>Build New Snapshot</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Version (e.g. v1.0)" value={version} onChange={(e) => setVersion(e.target.value)} className="w-40" />
            <Input placeholder="OpenClaw version" value={openclawVersion} onChange={(e) => setOpenclawVersion(e.target.value)} className="w-48" />
            <Button onClick={build} disabled={building || !version.trim() || !openclawVersion.trim()}>
              {building ? "Starting…" : "Build"}
            </Button>
          </div>
          {runId && <p className="text-xs text-muted-foreground">Started — <span className="font-mono">{runId}</span></p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots.</p>
        ) : snaps.map((snap) => (
          <Card key={snap.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex flex-wrap items-center gap-3">
                {snap.isActive && <Badge>active</Badge>}
                <span className="font-medium">{snap.version}</span>
                <span className="text-xs text-muted-foreground">OpenClaw {snap.openclawVersion}</span>
                <span className="font-mono text-xs text-muted-foreground">{snap.providerSnapshotId}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={() => del(snap.id)} disabled={deleting === snap.id}>
                {deleting === snap.id ? "Deleting…" : "Delete"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Plans panel ──────────────────────────────────────────────────────────────

function PlansPanel() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Create form state
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [tier, setTier] = useState("0");
  const [hetznerServerType, setHetznerServerType] = useState("cx33");
  const [benefits, setBenefits] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [syncToStripe, setSyncToStripe] = useState(true);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editPriceCents, setEditPriceCents] = useState("");
  const [editTier, setEditTier] = useState("0");
  const [editHetznerServerType, setEditHetznerServerType] = useState("cx33");
  const [editBenefits, setEditBenefits] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("0");
  const [editError, setEditError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getPlans();
      setPlans(data as Plan[]);
    } catch { setError("Failed to load plans"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!slug.trim() || !displayName.trim() || !priceCents) return;
    setSaving(true);
    setError("");
    try {
      await createPlan({
        slug: slug.trim(),
        displayName: displayName.trim(),
        tagline: tagline.trim(),
        priceCents: parseInt(priceCents, 10),
        tier: parseInt(tier, 10),
        providerSpec: JSON.stringify({ hetzner: { serverType: hetznerServerType } }),
        benefits,
        sortOrder: parseInt(sortOrder, 10) || 0,
        syncToStripe,
      });
      setShowForm(false);
      setSlug(""); setDisplayName(""); setTagline(""); setPriceCents(""); setTier("0");
      setHetznerServerType("cx33"); setBenefits(""); setSortOrder("0"); setSyncToStripe(true);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  async function toggle(planId: string, current: boolean) {
    try { await togglePlanActive(planId, !current); await load(); }
    catch { setError("Failed to update plan"); }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditSlug(plan.slug);
    setEditDisplayName(plan.displayName);
    setEditTagline(plan.tagline ?? "");
    setEditPriceCents(String(plan.priceCents));
    setEditTier(String(plan.tier));
    setEditHetznerServerType(
      (plan.providerSpec as { hetzner?: { serverType?: string } })?.hetzner?.serverType ?? "cx33"
    );
    setEditBenefits(plan.benefits.join("\n"));
    setEditSortOrder(String(plan.sortOrder));
    setEditError("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setEditError("");
    try {
      await updatePlan(editingId, {
        slug: editSlug.trim(),
        displayName: editDisplayName.trim(),
        tagline: editTagline.trim(),
        priceCents: parseInt(editPriceCents, 10),
        tier: parseInt(editTier, 10),
        providerSpec: JSON.stringify({ hetzner: { serverType: editHetznerServerType } }),
        benefits: editBenefits,
        sortOrder: parseInt(editSortOrder, 10) || 0,
      });
      setEditingId(null);
      await load();
    } catch (e) { setEditError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plans</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New Plan"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Create Plan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label>Slug</Label>
                <Input placeholder="go" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Display Name</Label>
                <Input placeholder="Go" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Tagline</Label>
                <Input placeholder="Personal assistant for daily use" value={tagline} onChange={(e) => setTagline(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Price (cents/mo)</Label>
                <Input type="number" placeholder="2900" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Tier (0, 1, 2…)</Label>
                <Input type="number" value={tier} onChange={(e) => setTier(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Sort Order</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Hetzner Server Type</Label>
              <Select
                value={hetznerServerType}
                onValueChange={(v) => {
                  if (v) setHetznerServerType(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HETZNER_SERVER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Benefits (one per line)</Label>
              <textarea
                value={benefits}
                onChange={(e) => setBenefits(e.target.value)}
                placeholder={"2 vCPU\n4 GB RAM\n40 GB SSD"}
                rows={4}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={syncToStripe}
                onChange={(e) => setSyncToStripe(e.target.checked)}
                className="size-4"
              />
              Sync to Stripe (creates Product + Price)
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={save} disabled={saving || !slug.trim() || !displayName.trim() || !priceCents}>
              {saving ? "Saving…" : "Create Plan"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans yet.</p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.isActive ? "" : "opacity-50"}>
              <CardContent className="py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={plan.isActive ? "default" : "outline"}>
                      {plan.isActive ? "active" : "inactive"}
                    </Badge>
                    <span className="font-medium">{plan.displayName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{plan.slug}</span>
                    <span className="text-xs text-muted-foreground">tier {plan.tier}</span>
                    <span className="text-xs text-muted-foreground">
                      ${(plan.priceCents / 100).toFixed(2)}/mo
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {(plan.providerSpec as { hetzner?: { serverType?: string } })?.hetzner?.serverType ?? "—"}
                    </span>
                    {(() => {
                      const ids = plan.billingProviderIds as {
                        stripeProductId?: string;
                        stripePriceId?: string;
                      };
                      if (!ids?.stripePriceId) {
                        return (
                          <Badge variant="outline" className="text-xs">no Stripe</Badge>
                        );
                      }
                      return (
                        <span className="font-mono text-xs text-muted-foreground">
                          {ids.stripePriceId}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => editingId === plan.id ? setEditingId(null) : startEdit(plan)}>
                      {editingId === plan.id ? "Cancel" : "Edit"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggle(plan.id, plan.isActive)}>
                      {plan.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>

                {editingId === plan.id && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label>Slug</Label>
                        <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>Display Name</Label>
                        <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>Tagline</Label>
                        <Input value={editTagline} onChange={(e) => setEditTagline(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>Price (cents/mo)</Label>
                        <Input type="number" value={editPriceCents} onChange={(e) => setEditPriceCents(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>Tier</Label>
                        <Input type="number" value={editTier} onChange={(e) => setEditTier(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>Sort Order</Label>
                        <Input type="number" value={editSortOrder} onChange={(e) => setEditSortOrder(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Hetzner Server Type</Label>
                      <Select
                        value={editHetznerServerType}
                        onValueChange={(v) => {
                          if (v) setEditHetznerServerType(v);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HETZNER_SERVER_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Benefits (one per line)</Label>
                      <textarea
                        value={editBenefits}
                        onChange={(e) => setEditBenefits(e.target.value)}
                        rows={3}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    {editError && <p className="text-sm text-destructive">{editError}</p>}
                    <Button size="sm" onClick={saveEdit} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!showForm && error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Credits panel ────────────────────────────────────────────────────────────

function CreditsPanel() {
  const [orgId, setOrgId] = useState("");
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mintPlanId, setMintPlanId] = useState("");
  const [mintDays, setMintDays] = useState("30");
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPlans()
      .then((data) => {
        setPlans(data as Plan[]);
        if (data.length > 0) setMintPlanId(data[0].id);
      })
      .catch(() => {});
  }, []);

  async function loadCredits() {
    if (!orgId.trim()) return;
    setLoadingCredits(true);
    setError("");
    try {
      const data = await getCreditsForOrg(orgId.trim());
      setCredits(data as Credit[]);
    } catch { setError("Failed to load credits"); }
    finally { setLoadingCredits(false); }
  }

  async function mint() {
    if (!orgId.trim() || !mintPlanId) return;
    setMinting(true);
    setError("");
    try {
      await mintCredit({ orgId: orgId.trim(), planId: mintPlanId, durationDays: parseInt(mintDays, 10) || 30 });
      await loadCredits();
    } catch { setError("Failed to mint credit"); }
    finally { setMinting(false); }
  }

  async function revoke(creditId: string) {
    try { await revokeCredit(creditId); await loadCredits(); }
    catch { setError("Failed to revoke credit"); }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Credits</h2>

      <Card>
        <CardHeader><CardTitle>Mint Credit</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label>Org ID</Label>
              <Input
                placeholder="org_xxx"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Plan</Label>
              <Select
                value={mintPlanId}
                onValueChange={(v) => {
                  if (v) setMintPlanId(v);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Duration (days)</Label>
              <Input type="number" value={mintDays} onChange={(e) => setMintDays(e.target.value)} className="w-24" />
            </div>
            <Button onClick={mint} disabled={minting || !orgId.trim() || !mintPlanId}>
              {minting ? "Minting…" : "Mint"}
            </Button>
            <Button variant="outline" onClick={loadCredits} disabled={loadingCredits || !orgId.trim()}>
              {loadingCredits ? "Loading…" : "Load"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {credits.length > 0 && (
        <div className="space-y-2">
          {credits.map((credit) => (
            <Card key={credit.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={credit.status === "active" ? "default" : "outline"}>
                    {credit.status}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{credit.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground">{credit.source}</span>
                  {credit.currentPeriodEnd && (
                    <span className="text-xs text-muted-foreground">
                      exp {new Date(credit.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                  {credit.consumedByAssistantId && (
                    <span className="text-xs text-muted-foreground">in use</span>
                  )}
                </div>
                {credit.status === "active" && (
                  <Button variant="destructive" size="sm" onClick={() => revoke(credit.id)}>
                    Revoke
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Admin{" "}
            <span
              className="accent"
              style={{ fontFamily: "var(--font-instrument-serif)" }}
            >
              console
            </span>
          </h1>
          <div className="page__sub">
            Platform-level operations. Snapshots, plans, and credits live here — only
            visible to platform admins.
          </div>
        </div>
      </div>
      <div className="space-y-10">
        <SnapshotsPanel />
        <PlansPanel />
        <CreditsPanel />
      </div>
    </div>
  );
}
