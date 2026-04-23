"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  SectionCard,
  Field,
  Callout,
  Icon,
  StatusPill,
  RowMenu,
  type RowMenuItem,
  type IconName,
} from "@/components/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatPrice } from "@/lib/dashboard/format";

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

type AdminTab = "snapshots" | "plans" | "credits";

const TABS: { key: AdminTab; label: string; icon: IconName }[] = [
  { key: "snapshots", label: "Snapshots", icon: "layers" },
  { key: "plans", label: "Plans", icon: "tag" },
  { key: "credits", label: "Credits", icon: "coins" },
];

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

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch {
      setError("Failed to start snapshot build");
    } finally {
      setBuilding(false);
    }
  }

  async function del(snapshotId: string) {
    setDeleting(snapshotId);
    setError("");
    try {
      await triggerSnapshotDelete(snapshotId);
      await load();
    } catch {
      setError("Failed to start snapshot deletion");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Build new snapshot"
        sub="Bake a fresh OpenClaw image. Existing assistants are untouched."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Version">
            <input
              className="input w-40"
              placeholder="v1.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </Field>
          <Field label="OpenClaw version">
            <input
              className="input w-48"
              placeholder="v0.4.3"
              value={openclawVersion}
              onChange={(e) => setOpenclawVersion(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void build()}
            disabled={building || !version.trim() || !openclawVersion.trim()}
          >
            <Icon name="zap" size={14} />
            {building ? "Starting…" : "Build snapshot"}
          </button>
        </div>
        {runId ? (
          <div className="faint mt-3 text-[11px] font-mono">
            Started — <span className="text-foreground">{runId}</span>
          </div>
        ) : null}
        {error ? (
          <div className="field__err mt-3">{error}</div>
        ) : null}
      </SectionCard>

      <SectionCard title="Snapshots" sub={`${snaps.length} total`} pad={false}>
        {loading ? (
          <div className="p-6 text-[13px] text-muted-foreground">Loading…</div>
        ) : snaps.length === 0 ? (
          <div className="p-6 text-[13px] text-muted-foreground">No snapshots yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>OpenClaw</th>
                <th>Status</th>
                <th>Provider id</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snaps.map((snap) => (
                <tr key={snap.id}>
                  <td className="mono">{snap.version}</td>
                  <td className="mono dim">{snap.openclawVersion}</td>
                  <td>
                    {snap.isActive ? (
                      <span className="pill pill--active">Active</span>
                    ) : (
                      <span className="pill pill--default">Archived</span>
                    )}
                  </td>
                  <td className="mono dim">{snap.providerSnapshotId}</td>
                  <td className="dim">{formatDate(new Date(snap.createdAt).toISOString())}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => void del(snap.id)}
                      disabled={deleting === snap.id}
                    >
                      <Icon name="trash" size={12} />
                      {deleting === snap.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
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

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [tier, setTier] = useState("0");
  const [hetznerServerType, setHetznerServerType] = useState("cx33");
  const [benefits, setBenefits] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [syncToStripe, setSyncToStripe] = useState(true);

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
    } catch {
      setError("Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setSlug("");
      setDisplayName("");
      setTagline("");
      setPriceCents("");
      setTier("0");
      setHetznerServerType("cx33");
      setBenefits("");
      setSortOrder("0");
      setSyncToStripe(true);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(planId: string, current: boolean) {
    try {
      await togglePlanActive(planId, !current);
      await load();
    } catch {
      setError("Failed to update plan");
    }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditSlug(plan.slug);
    setEditDisplayName(plan.displayName);
    setEditTagline(plan.tagline ?? "");
    setEditPriceCents(String(plan.priceCents));
    setEditTier(String(plan.tier));
    setEditHetznerServerType(
      (plan.providerSpec as { hetzner?: { serverType?: string } })?.hetzner?.serverType ??
        "cx33",
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
    } catch (e) {
      setEditError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {showForm ? (
        <SectionCard
          title="New plan"
          sub="Create a new tier. If sync-to-Stripe is on, we'll create a Stripe Product + Price too."
          actions={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowForm(false)}
            >
              <Icon name="x" size={12} />
              Cancel
            </button>
          }
        >
          <PlanForm
            slug={slug}
            setSlug={setSlug}
            displayName={displayName}
            setDisplayName={setDisplayName}
            tagline={tagline}
            setTagline={setTagline}
            priceCents={priceCents}
            setPriceCents={setPriceCents}
            tier={tier}
            setTier={setTier}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            hetznerServerType={hetznerServerType}
            setHetznerServerType={setHetznerServerType}
            benefits={benefits}
            setBenefits={setBenefits}
            extra={
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={syncToStripe}
                  onChange={(e) => setSyncToStripe(e.target.checked)}
                  className="size-4"
                />
                Sync to Stripe (creates Product + Price)
              </label>
            }
          />
          {error ? (
            <div className="field__err mt-3">{error}</div>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void save()}
              disabled={saving || !slug.trim() || !displayName.trim() || !priceCents}
            >
              <Icon name="check" size={14} />
              {saving ? "Creating…" : "Create plan"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Plans"
        sub={`${plans.length} total · the customer-facing pricing tiers`}
        pad={false}
        actions={
          !showForm ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShowForm(true)}
            >
              <Icon name="plus" size={12} />
              New plan
            </button>
          ) : null
        }
      >
        {loading ? (
          <div className="p-6 text-[13px] text-muted-foreground">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="p-6 text-[13px] text-muted-foreground">No plans yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Price</th>
                <th>Tier</th>
                <th>Server type</th>
                <th>Stripe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const ids = plan.billingProviderIds as {
                  stripeProductId?: string;
                  stripePriceId?: string;
                };
                const hetz = (
                  plan.providerSpec as { hetzner?: { serverType?: string } }
                )?.hetzner?.serverType;
                const menu: RowMenuItem[] = [
                  {
                    label: editingId === plan.id ? "Close edit" : "Edit plan",
                    icon: "edit",
                    onClick: () =>
                      editingId === plan.id ? setEditingId(null) : startEdit(plan),
                  },
                  { divider: true },
                  {
                    label: plan.isActive ? "Deactivate" : "Activate",
                    icon: plan.isActive ? "pause" : "play",
                    onClick: () => void toggle(plan.id, plan.isActive),
                  },
                ];
                return (
                  <>
                    <tr key={plan.id} className={plan.isActive ? "" : "opacity-60"}>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{plan.displayName}</span>
                          <span className="mono faint text-[11px]">{plan.slug}</span>
                        </div>
                      </td>
                      <td>
                        {plan.isActive ? (
                          <StatusPill status="active" />
                        ) : (
                          <span className="pill pill--default">Inactive</span>
                        )}
                      </td>
                      <td className="mono">
                        {formatPrice(plan.priceCents, "USD")}
                        <span className="faint">/mo</span>
                      </td>
                      <td className="dim text-xs">tier {plan.tier}</td>
                      <td className="mono dim">{hetz ?? "—"}</td>
                      <td>
                        {ids?.stripePriceId ? (
                          <span className="mono dim text-[11px]">
                            {ids.stripePriceId.slice(0, 16)}…
                          </span>
                        ) : (
                          <span className="pill pill--warn">Missing</span>
                        )}
                      </td>
                      <td className="text-right">
                        <RowMenu items={menu} />
                      </td>
                    </tr>
                    {editingId === plan.id ? (
                      <tr key={`${plan.id}-edit`}>
                        <td
                          colSpan={7}
                          className="border-t border-border bg-muted px-[18px] py-4"
                        >
                          <div className="flex flex-col gap-3">
                            <PlanForm
                              slug={editSlug}
                              setSlug={setEditSlug}
                              displayName={editDisplayName}
                              setDisplayName={setEditDisplayName}
                              tagline={editTagline}
                              setTagline={setEditTagline}
                              priceCents={editPriceCents}
                              setPriceCents={setEditPriceCents}
                              tier={editTier}
                              setTier={setEditTier}
                              sortOrder={editSortOrder}
                              setSortOrder={setEditSortOrder}
                              hetznerServerType={editHetznerServerType}
                              setHetznerServerType={setEditHetznerServerType}
                              benefits={editBenefits}
                              setBenefits={setEditBenefits}
                            />
                            {editError ? (
                              <div className="field__err">{editError}</div>
                            ) : null}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                onClick={() => void saveEdit()}
                                disabled={saving}
                              >
                                <Icon name="check" size={12} />
                                {saving ? "Saving…" : "Save changes"}
                              </button>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
        {!showForm && error ? (
          <div className="border-t border-border p-4">
            <div className="field__err">{error}</div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function PlanForm({
  slug,
  setSlug,
  displayName,
  setDisplayName,
  tagline,
  setTagline,
  priceCents,
  setPriceCents,
  tier,
  setTier,
  sortOrder,
  setSortOrder,
  hetznerServerType,
  setHetznerServerType,
  benefits,
  setBenefits,
  extra,
}: {
  slug: string;
  setSlug: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;
  priceCents: string;
  setPriceCents: (v: string) => void;
  tier: string;
  setTier: (v: string) => void;
  sortOrder: string;
  setSortOrder: (v: string) => void;
  hetznerServerType: string;
  setHetznerServerType: (v: string) => void;
  benefits: string;
  setBenefits: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid2 gap-3">
        <Field label="Slug">
          <input
            className="input"
            placeholder="go"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
        <Field label="Display name">
          <input
            className="input"
            placeholder="Go"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Tagline">
          <input
            className="input"
            placeholder="Personal assistant for daily use"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </Field>
        <Field label="Price (cents/mo)">
          <input
            className="input"
            type="number"
            placeholder="2900"
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
          />
        </Field>
        <Field label="Tier">
          <input
            className="input"
            type="number"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          />
        </Field>
        <Field label="Sort order">
          <input
            className="input"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Hetzner server type">
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
      </Field>
      <Field label="Benefits" hint="One per line. Shown on the pricing page.">
        <textarea
          className="input min-h-[96px] py-2"
          rows={4}
          placeholder={"2 vCPU\n4 GB RAM\n40 GB SSD"}
          value={benefits}
          onChange={(e) => setBenefits(e.target.value)}
        />
      </Field>
      {extra}
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
    } catch {
      setError("Failed to load credits");
    } finally {
      setLoadingCredits(false);
    }
  }

  async function mint() {
    if (!orgId.trim() || !mintPlanId) return;
    setMinting(true);
    setError("");
    try {
      await mintCredit({
        orgId: orgId.trim(),
        planId: mintPlanId,
        durationDays: parseInt(mintDays, 10) || 30,
      });
      await loadCredits();
    } catch {
      setError("Failed to mint credit");
    } finally {
      setMinting(false);
    }
  }

  async function revoke(creditId: string) {
    try {
      await revokeCredit(creditId);
      await loadCredits();
    } catch {
      setError("Failed to revoke credit");
    }
  }

  const planById = new Map(plans.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Mint or load credits for an org"
        sub="Granted credits don't trigger a Stripe charge. Useful for trials and incidents."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Org ID" hint="org_xxx — copy from the org switcher">
            <input
              className="input w-64"
              placeholder="org_xxx"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            />
          </Field>
          <Field label="Plan">
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
          </Field>
          <Field label="Duration (days)">
            <input
              className="input w-24"
              type="number"
              value={mintDays}
              onChange={(e) => setMintDays(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void mint()}
            disabled={minting || !orgId.trim() || !mintPlanId}
          >
            <Icon name="plus" size={14} />
            {minting ? "Minting…" : "Mint credit"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void loadCredits()}
            disabled={loadingCredits || !orgId.trim()}
          >
            <Icon name="refresh" size={14} />
            {loadingCredits ? "Loading…" : "Load org credits"}
          </button>
        </div>
        {error ? <div className="field__err mt-3">{error}</div> : null}
      </SectionCard>

      {credits.length > 0 ? (
        <SectionCard
          title="Credits for org"
          sub={`${credits.length} total — granted + Stripe-backed`}
          pad={false}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Source</th>
                <th>Expires</th>
                <th>Attached</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {credits.map((credit) => {
                const plan = planById.get(credit.planId);
                return (
                  <tr key={credit.id}>
                    <td className="mono dim">{credit.id.slice(0, 10)}</td>
                    <td>{plan?.displayName ?? "—"}</td>
                    <td>
                      <StatusPill status={credit.status} />
                    </td>
                    <td>
                      {credit.source === "stripe" ? (
                        "Stripe"
                      ) : credit.source === "granted" ? (
                        <span className="pill pill--info">Granted</span>
                      ) : (
                        credit.source
                      )}
                    </td>
                    <td className="dim mono">
                      {credit.currentPeriodEnd
                        ? formatDate(new Date(credit.currentPeriodEnd).toISOString())
                        : "—"}
                    </td>
                    <td>
                      {credit.consumedByAssistantId ? (
                        <span className="mono faint text-[11px]">
                          {credit.consumedByAssistantId.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="faint">Available</span>
                      )}
                    </td>
                    <td className="text-right">
                      {credit.status === "active" ? (
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => void revoke(credit.id)}
                        >
                          <Icon name="trash" size={12} />
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      ) : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("snapshots");

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Admin <span className="accent">console</span>
          </h1>
          <div className="page__sub">
            Platform-level operations. Snapshots, plans, and credits live here — only
            visible to platform admins.
          </div>
        </div>
        <div className="page__actions">
          <Callout kind="warn" icon="shield">
            Staff only
          </Callout>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tabs__tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "snapshots" ? <SnapshotsPanel /> : null}
      {tab === "plans" ? <PlansPanel /> : null}
      {tab === "credits" ? <CreditsPanel /> : null}
    </div>
  );
}
