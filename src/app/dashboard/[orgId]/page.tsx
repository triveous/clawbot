"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRpc } from "@/hooks/use-rpc";
import {
  Icon,
  StatusPill,
  Segmented,
  Callout,
  CreateAssistantDrawer,
  CreateAssistantWizard,
  FirstAssistantHero,
} from "@/components/dashboard";
import { useOrganization } from "@clerk/nextjs";
import { relTime } from "@/lib/dashboard/format";
import type { AssistantResponse, AssistantStatus } from "@/types/assistant";

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

type Filter = "all" | AssistantStatus;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "creating", label: "Provisioning" },
  { value: "error", label: "Error" },
  { value: "stopped", label: "Stopped" },
];

const REGION_LABELS: Record<string, string> = {
  fsn1: "Falkenstein",
  nbg1: "Nuremberg",
  hel1: "Helsinki",
};

function regionLabel(region: string) {
  return REGION_LABELS[region] ?? region;
}

function accessLabel(mode: AssistantResponse["accessMode"]) {
  return mode === "ssh" ? "SSH" : "Tailscale";
}

export default function AssistantsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();
  const router = useRouter();

  const [assistants, setAssistants] = useState<AssistantResponse[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const { organization } = useOrganization();

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
      }
      if (cRes.ok) {
        const d = (await cRes.json()) as { credits: Credit[] };
        setCredits(d.credits);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const availableCredits = useMemo(
    () =>
      credits.filter(
        (c) =>
          c.status === "active" &&
          !c.consumedByAssistantId &&
          c.currentPeriodEnd &&
          new Date(c.currentPeriodEnd) > new Date(),
      ),
    [credits],
  );

  const runningCount = assistants.filter((a) => a.status === "active").length;
  const rows = assistants.filter((a) => filter === "all" || a.status === filter);
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  async function retry(id: string) {
    setRetrying((prev) => ({ ...prev, [id]: true }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].retry.$post({ param: { id } });
      await loadAll();
    } finally {
      setRetrying((prev) => ({ ...prev, [id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="page__loading">
        <Icon name="bot" size={20} />
        Loading assistants…
      </div>
    );
  }

  if (assistants.length === 0) {
    return (
      <>
        <FirstAssistantHero
          orgName={organization?.name ?? "this workspace"}
          onStart={() => setWizardOpen(true)}
          paused={wizardOpen}
        />
        <CreateAssistantWizard
          orgId={orgId}
          isFirst
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onDeployed={(id) => {
            setWizardOpen(false);
            router.push(`/dashboard/${orgId}/assistant/${id}`);
          }}
        />
      </>
    );
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Assistants{" "}
            <span className="faint" style={{ fontSize: 20, fontWeight: 400 }}>
              {assistants.length}
            </span>
          </h1>
          <div className="page__sub">
            {availableCredits.length} credit{availableCredits.length !== 1 ? "s" : ""} available
            {" · "}
            {runningCount} running
            {" · "}
            <Link href={`/dashboard/${orgId}/billing`} className="faint">
              view billing
            </Link>
          </div>
        </div>
        <div className="page__actions">
          <Segmented<Filter> value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setWizardOpen(true)}
            title="Immersive create flow"
          >
            <Icon name="zap" size={14} />
            Wizard
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="plus" size={14} />
            New assistant
          </button>
        </div>
      </div>

      {availableCredits.length === 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="warn" icon="alert" title="No available credits">
            You&rsquo;re at your plan limit.{" "}
            <Link href={`/dashboard/${orgId}/pricing`} style={{ textDecoration: "underline" }}>
              Upgrade
            </Link>{" "}
            or delete an assistant to free a credit.
          </Callout>
        </div>
      ) : null}

      <div className="card">
        <div
          className="asst-row"
          style={{
            padding: "10px 18px",
            background: "var(--db-bg-2)",
            borderBottom: "1px solid var(--db-hair)",
            cursor: "default",
            fontSize: 11,
            color: "var(--db-text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          <span />
          <span>Name</span>
          <span>Status</span>
          <span>Plan</span>
          <span>Address</span>
          <span>Created</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
            No assistants match this filter.
          </div>
        ) : (
          rows.map((a) => {
            const plan = planById.get(a.planId);
            const address = a.ipv4
              ? `${a.ipv4}${a.gatewayPort ? `:${a.gatewayPort}` : ""}`
              : a.hostname ?? "—";
            return (
              <Link
                key={a.id}
                href={`/dashboard/${orgId}/assistant/${a.id}`}
                className="asst-row"
              >
                <div className="asst-row__icon">
                  <Icon name="bot" size={14} />
                </div>
                <div>
                  <div className="asst-row__name">{a.name}</div>
                  <div className="asst-row__sub">
                    {regionLabel(a.region)} · {accessLabel(a.accessMode)}
                  </div>
                </div>
                <StatusPill status={a.status} />
                <span className="dim" style={{ fontSize: 12 }}>
                  {plan?.displayName ?? "—"}
                </span>
                <span className="mono dim">{address}</span>
                <span className="dim" style={{ fontSize: 12 }}>
                  {relTime(a.createdAt)}
                </span>
                <div
                  style={{ display: "flex", gap: 6 }}
                  onClick={(e) => {
                    // don't let button clicks trigger the row link navigation
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                >
                  {a.status === "error" ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={!!retrying[a.id]}
                      onClick={() => retry(a.id)}
                    >
                      <Icon name="refresh" size={14} />
                      {retrying[a.id] ? "Retrying…" : "Retry"}
                    </button>
                  ) : null}
                  <span className="btn btn--ghost btn--sm" aria-hidden>
                    <Icon name="chevRight" size={14} />
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <CreateAssistantDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={async (id) => {
          await loadAll();
          router.push(`/dashboard/${orgId}/assistant/${id}`);
        }}
      />

      <CreateAssistantWizard
        orgId={orgId}
        isFirst={false}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onDeployed={(id) => {
          setWizardOpen(false);
          router.push(`/dashboard/${orgId}/assistant/${id}`);
        }}
      />
    </div>
  );
}
