"use client";

import { useEffect, useMemo, useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { Icon, Field, Callout, Segmented } from "@/components/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/dashboard/format";
import type { AccessMode } from "@/types/assistant";

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  providerSpec?: {
    hetzner?: {
      serverType?: string;
      cpu?: string;
      mem?: string;
      disk?: string;
    };
  };
};

type Credit = {
  planId: string;
  status: string;
  consumedByAssistantId: string | null;
  currentPeriodEnd: string | null;
};

const REGION_OPTIONS = [
  { value: "fsn1", label: "fsn1 — Falkenstein, Germany" },
  { value: "nbg1", label: "nbg1 — Nuremberg, Germany" },
  { value: "hel1", label: "hel1 — Helsinki, Finland" },
];

const ACCESS_OPTIONS = [
  { value: "ssh" as const, label: "SSH tunnel" },
  { value: "tailscale_serve" as const, label: "Tailscale" },
];

export function CreateAssistantDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const rpc = useRpc();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [name, setName] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [region, setRegion] = useState<string>("fsn1");
  const [accessMode, setAccessMode] = useState<AccessMode>("ssh");
  const [sshAllowedIps, setSshAllowedIps] = useState("0.0.0.0/0");
  const [tailscaleAuthKey, setTailscaleAuthKey] = useState("");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Load plans + credits when the drawer opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMeta(true);
    void (async () => {
      try {
        const [pRes, cRes] = await Promise.all([rpc.api.plans.$get(), rpc.api.credits.$get()]);
        if (cancelled) return;
        if (pRes.ok) {
          const pd = (await pRes.json()) as { plans: Plan[] };
          setPlans(pd.plans);
          if (pd.plans.length > 0) setPlanId((prev) => prev || pd.plans[0].id);
        }
        if (cRes.ok) {
          const cd = (await cRes.json()) as { credits: Credit[] };
          setCredits(cd.credits);
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rpc]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const availableByPlan = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of credits) {
      if (
        c.status === "active" &&
        !c.consumedByAssistantId &&
        c.currentPeriodEnd &&
        new Date(c.currentPeriodEnd) > new Date()
      ) {
        m.set(c.planId, (m.get(c.planId) ?? 0) + 1);
      }
    }
    return m;
  }, [credits]);

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const selectedPlanHasCredit = selectedPlan ? (availableByPlan.get(selectedPlan.id) ?? 0) > 0 : false;

  const canCreate =
    !!name.trim() &&
    !!planId &&
    !!region &&
    selectedPlanHasCredit &&
    (accessMode !== "tailscale_serve" || !!tailscaleAuthKey.trim()) &&
    !creating;

  async function deploy() {
    if (!canCreate) return;
    setCreating(true);
    setCreateError("");
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        planId,
        region,
        accessMode,
      };
      if (accessMode === "ssh" && sshAllowedIps.trim()) {
        body.sshAllowedIps = sshAllowedIps.trim();
      }
      if (accessMode === "tailscale_serve") {
        body.tailscaleAuthKey = tailscaleAuthKey.trim();
      }
      const res = await rpc.api.assistants.$post({ json: body });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        setCreateError(err.message ?? "Failed to deploy");
        return;
      }
      const data = (await res.json()) as { assistant?: { id: string }; id?: string };
      const id = data.assistant?.id ?? data.id;
      if (id) onCreated(id);
      onClose();
      // Reset for next open
      setName("");
      setTailscaleAuthKey("");
    } catch {
      setCreateError("Failed to deploy");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="New assistant">
        <div className="drawer__head">
          <div className="asst-row__icon">
            <Icon name="bot" size={14} />
          </div>
          <div>
            <div className="drawer__title">New assistant</div>
            <div className="card__sub">Spin up a fresh OpenClaw VPS</div>
          </div>
          <div className="flex-1" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer__body">
          {loadingMeta ? (
            <div className="faint text-[13px]">
              Loading plans…
            </div>
          ) : plans.length === 0 ? (
            <Callout kind="warn" icon="alert" title="No plans configured">
              Ask an admin to create a plan from the Admin console before you can deploy.
            </Callout>
          ) : (
            <div className="col gap-[18px]">
              <Field
                label="Name"
                hint="Used as hostname slug. Lowercase letters, numbers, hyphens."
              >
                <input
                  className="input"
                  placeholder="my-assistant"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </Field>

              <Field label="Plan">
                <div className="col gap-2">
                  {plans.map((p) => {
                    const selected = planId === p.id;
                    const credits = availableByPlan.get(p.id) ?? 0;
                    const hetz = p.providerSpec?.hetzner;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPlanId(p.id)}
                        className={`plan-pick px-3.5 py-2.5 border rounded-lg cursor-pointer flex items-center gap-3 text-left font-[inherit] text-[color:inherit] ${selected ? "border-primary bg-primary/15" : "border-border bg-transparent"}`}
                      >
                        <div
                          className="w-[14px] h-[14px] rounded-full shrink-0"
                          style={{
                            border: `2px solid ${selected ? "var(--db-red)" : "var(--db-hair-strong)"}`,
                            background: selected ? "var(--db-red)" : "transparent",
                            boxShadow: selected ? "inset 0 0 0 3px var(--db-bg-2)" : "none",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[13px]">{p.displayName}</div>
                          <div className="mono faint">
                            {hetz
                              ? `${hetz.cpu ?? "—"} · ${hetz.mem ?? "—"} · ${hetz.disk ?? "—"}`
                              : (p.tagline ?? "—")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs">
                            {formatPrice(p.priceCents, p.currency)}
                            <span className="faint">/mo</span>
                          </div>
                          <div className="faint text-[10px] font-mono mt-0.5">
                            {credits > 0 ? `${credits} credit${credits > 1 ? "s" : ""}` : "no credit"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!selectedPlanHasCredit && selectedPlan ? (
                  <div className="field__err mt-1.5">
                    You have no available credit on {selectedPlan.displayName}. Buy one from
                    Pricing.
                  </div>
                ) : null}
              </Field>

              <Field label="Region">
                <Select
                  value={region}
                  onValueChange={(v) => {
                    if (v) setRegion(v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Access mode"
                hint={
                  accessMode === "ssh"
                    ? "Expose port 22; connect via SSH tunnel."
                    : "No public ports — served over Tailscale."
                }
              >
                <Segmented
                  fullWidth
                  value={accessMode}
                  onChange={setAccessMode}
                  options={ACCESS_OPTIONS}
                />
              </Field>

              {accessMode === "ssh" ? (
                <Field
                  label="Allowed IPs (CIDR, comma-separated)"
                  hint="0.0.0.0/0 allows anywhere. Narrow this down if you can."
                >
                  <input
                    className="input"
                    value={sshAllowedIps}
                    onChange={(e) => setSshAllowedIps(e.target.value)}
                  />
                </Field>
              ) : (
                <Field label="Tailscale auth key">
                  <input
                    className="input"
                    type="password"
                    placeholder="tskey-auth-…"
                    value={tailscaleAuthKey}
                    onChange={(e) => setTailscaleAuthKey(e.target.value)}
                  />
                  <Callout kind="warn" icon="alert" title="Key is not verified">
                    If this key is invalid or expired, provisioning will fail. You&rsquo;ll need
                    to delete the assistant and create a new one with a valid key.
                  </Callout>
                </Field>
              )}

              {selectedPlan ? (
                <Callout
                  kind="default"
                  icon="zap"
                  title={`${selectedPlan.displayName} · ${formatPrice(selectedPlan.priceCents, selectedPlan.currency)}/mo`}
                >
                  Consumes 1 credit. Provisioning usually takes 2&ndash;3 minutes.
                </Callout>
              ) : null}

              {createError ? (
                <Callout kind="danger" icon="alert" title="Deploy failed">
                  {createError}
                </Callout>
              ) : null}
            </div>
          )}
        </div>

        <div className="drawer__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={deploy}
            disabled={!canCreate}
          >
            <Icon name="zap" size={14} />
            {creating ? "Deploying…" : "Deploy assistant"}
          </button>
        </div>
      </div>
    </>
  );
}
