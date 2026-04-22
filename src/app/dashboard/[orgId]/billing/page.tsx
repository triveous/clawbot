"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOrganization } from "@clerk/nextjs";
import { useRpc } from "@/hooks/use-rpc";
import {
  SectionCard,
  Icon,
  StatusPill,
  Callout,
  RowMenu,
  type RowMenuItem,
} from "@/components/dashboard";
import { formatDate, formatPrice } from "@/lib/dashboard/format";

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string;
  country: string;
  isDefault: boolean;
};

const CARD_BRAND_COLORS: Record<string, string> = {
  visa: "#1a1f71",
  mastercard: "#eb001b",
  amex: "#2e77bb",
  discover: "#ff6000",
  jcb: "#0e4c96",
  diners: "#0079be",
  unionpay: "#e21836",
  unknown: "var(--db-surface-3)",
};

function brandLabel(brand: string) {
  if (!brand) return "CARD";
  if (brand === "mastercard") return "MC";
  if (brand === "amex") return "AMEX";
  if (brand === "discover") return "DISC";
  if (brand === "jcb") return "JCB";
  return brand.toUpperCase().slice(0, 6);
}

type Subscription = {
  id: string;
  planId: string;
  planSlug: string;
  planDisplayName: string;
  priceCents: number;
  currency: string;
  stripeSubscriptionId: string;
  stripeScheduleId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  createdAt: string;
};

type Invoice = {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  issuedAt: string | null;
  paidAt: string | null;
};

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  priceCents: number;
  currency: string;
  tier: number;
};

type Credit = {
  id: string;
  planId: string;
  status: string;
  source: string;
  currentPeriodEnd: string | null;
  consumedByAssistantId: string | null;
};

type Assistant = {
  id: string;
  name: string;
  status: string;
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function BillingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [changingPlanFor, setChangingPlanFor] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [subRes, invRes, planRes, creditRes, asstRes] = await Promise.all([
        rpc.api.billing.subscriptions.$get(),
        rpc.api.billing.invoices.$get(),
        rpc.api.plans.$get(),
        rpc.api.credits.$get(),
        rpc.api.assistants.$get(),
      ]);
      if (subRes.ok) {
        const data = (await subRes.json()) as { subscriptions: Subscription[] };
        setSubs(data.subscriptions);
      }
      if (invRes.ok) {
        const data = (await invRes.json()) as { invoices: Invoice[] };
        setInvoices(data.invoices);
      }
      if (planRes.ok) {
        const data = (await planRes.json()) as { plans: Plan[] };
        setPlans(data.plans);
      }
      if (creditRes.ok) {
        const data = (await creditRes.json()) as { credits: Credit[] };
        setCredits(data.credits);
      }
      if (asstRes.ok) {
        const data = (await asstRes.json()) as { assistants: Assistant[] };
        setAssistants(data.assistants);
      }
    } catch {
      setError("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  const loadPaymentMethods = useCallback(async () => {
    setPaymentMethodsLoaded(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.billing as any)["payment-methods"].$get();
      if (res.ok) {
        const data = (await res.json()) as { paymentMethods: PaymentMethod[] };
        setPaymentMethods(data.paymentMethods);
      }
    } finally {
      setPaymentMethodsLoaded(true);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadPaymentMethods();
  }, [isAdmin, loadPaymentMethods]);

  const activeSubs = useMemo(
    () => subs.filter((s) => s.status === "active" || s.status === "trialing"),
    [subs],
  );

  const pastDue = useMemo(
    () => subs.filter((s) => s.status === "past_due" || s.status === "unpaid"),
    [subs],
  );

  const activeCredits = useMemo(
    () => credits.filter((c) => c.status === "active" || c.status === "trialing"),
    [credits],
  );
  const consumedCredits = activeCredits.filter((c) => c.consumedByAssistantId).length;
  const availableCredits = activeCredits.length - consumedCredits;
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const assistantById = useMemo(
    () => new Map(assistants.map((a) => [a.id, a])),
    [assistants],
  );

  const monthlyTotal = activeSubs.reduce((sum, s) => sum + s.priceCents, 0);
  const nextChargeDate = activeSubs
    .map((s) => s.currentPeriodEnd)
    .filter((d): d is string => !!d)
    .sort()
    .shift();
  const lifetimeCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountPaid, 0);
  const defaultCurrency = activeSubs[0]?.currency ?? invoices[0]?.currency ?? "USD";

  async function openPortal() {
    setBusy("portal");
    try {
      const res = await rpc.api.billing.portal.$post();
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        window.location.href = data.url;
      } else {
        setError("Could not open Stripe portal");
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancelSub(subId: string) {
    setBusy(subId);
    try {
      const res = await rpc.api.billing.subscriptions[":id"].cancel.$post({
        param: { id: subId },
      });
      if (res.ok) {
        setConfirmCancel(null);
        await load();
      } else {
        setError("Cancel failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function changePlan(
    subId: string,
    newPlanId: string,
    mode: "upgrade" | "downgrade",
  ) {
    setBusy(subId);
    try {
      const res = await fetch(`/api/billing/subscriptions/${subId}/change-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPlanId, mode }),
      });
      if (res.ok) {
        setChangingPlanFor(null);
        await load();
      } else {
        setError("Plan change failed");
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="page__loading">
        <Icon name="creditCard" size={20} />
        Loading billing…
      </div>
    );
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Billing{" "}
            <span className="accent" style={{ fontFamily: "var(--font-instrument-serif)" }}>
              &amp; credits
            </span>
          </h1>
          <div className="page__sub">
            Credits are what you buy. One credit → one live assistant.
          </div>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={openPortal}
            disabled={busy === "portal"}
          >
            <Icon name="creditCard" size={14} />
            {busy === "portal" ? "Opening…" : "Manage payment"}
          </button>
          <Link href={`/dashboard/${orgId}/pricing`} className="btn btn--primary">
            <Icon name="plus" size={14} />
            Buy credit
          </Link>
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="danger" icon="alert" title="Something went wrong">
            {error}
          </Callout>
        </div>
      ) : null}

      {pastDue.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Callout
            kind="danger"
            icon="alert"
            title={`${pastDue.length} subscription${pastDue.length > 1 ? "s" : ""} past due`}
          >
            Assistant is paused until payment is collected. Update your card from the Stripe
            portal to resume.
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={openPortal}
                disabled={busy === "portal"}
              >
                <Icon name="creditCard" size={12} />
                Update payment method
              </button>
            </div>
          </Callout>
        </div>
      ) : null}

      {/* Stat strip */}
      <div className="grid4" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat__label">Monthly total</div>
          <div className="stat__value">
            {formatPrice(monthlyTotal, defaultCurrency)}
            <span className="unit">/mo</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Credits</div>
          <div className="stat__value">{activeCredits.length}</div>
          <div
            className="faint"
            style={{ fontSize: 11, marginTop: 3, fontFamily: "var(--font-geist-mono)" }}
          >
            {consumedCredits} in use · {availableCredits} available
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Next charge</div>
          <div className="stat__value">
            {nextChargeDate ? formatDate(nextChargeDate) : "—"}
          </div>
          <div
            className="faint"
            style={{ fontSize: 11, marginTop: 3, fontFamily: "var(--font-geist-mono)" }}
          >
            {activeSubs.length > 0
              ? `${formatMoney(monthlyTotal, defaultCurrency)} via Stripe`
              : "no active subs"}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Lifetime paid</div>
          <div className="stat__value">{formatMoney(lifetimeCents, defaultCurrency)}</div>
          <div
            className="faint"
            style={{ fontSize: 11, marginTop: 3, fontFamily: "var(--font-geist-mono)" }}
          >
            {invoices.filter((i) => i.status === "paid").length} paid invoices
          </div>
        </div>
      </div>

      {/* Credits — slots in your pool. One slot == one live assistant. */}
      <SectionCard
        title="Credits"
        sub="Each credit is a pre-paid slot for one assistant"
        pad={false}
        actions={
          <Link
            href={`/dashboard/${orgId}/pricing`}
            className="btn btn--ghost btn--sm"
          >
            <Icon name="plus" size={12} />
            Buy credit
          </Link>
        }
      >
        {credits.length === 0 ? (
          <div
            style={{
              padding: "36px 24px",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: 13,
            }}
          >
            No credits yet. Buy one to deploy your first assistant.
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/dashboard/${orgId}/pricing`}
                className="btn btn--primary btn--sm"
              >
                <Icon name="tag" size={12} />
                See pricing
              </Link>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Attached to</th>
                <th>Renews</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => {
                const plan = planById.get(c.planId);
                const attached = c.consumedByAssistantId
                  ? assistantById.get(c.consumedByAssistantId)
                  : null;
                return (
                  <tr key={c.id}>
                    <td className="mono dim">{c.id.slice(0, 10)}</td>
                    <td>
                      {plan?.displayName ?? "—"}
                      {plan ? (
                        <span className="faint" style={{ marginLeft: 6 }}>
                          {formatMoney(plan.priceCents, plan.currency)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>
                      {attached ? (
                        <Link
                          href={`/dashboard/${orgId}/assistant/${attached.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                          }}
                        >
                          <Icon name="bot" size={12} />
                          {attached.name}
                        </Link>
                      ) : c.consumedByAssistantId ? (
                        <span className="mono faint">
                          {c.consumedByAssistantId.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="faint">Available</span>
                      )}
                    </td>
                    <td className="dim mono">
                      {c.currentPeriodEnd ? formatDate(c.currentPeriodEnd) : "—"}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {c.source === "stripe" ? (
                        "Stripe subscription"
                      ) : c.source === "granted" ? (
                        <span className="pill pill--info">Granted</span>
                      ) : (
                        c.source
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!c.consumedByAssistantId && c.status === "active" ? (
                        <Link
                          href={`/dashboard/${orgId}`}
                          className="btn btn--ghost btn--sm"
                        >
                          <Icon name="zap" size={12} />
                          Attach
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <div style={{ height: 20 }} />

      {/* Subscriptions table */}
      <SectionCard
        title="Subscriptions"
        sub="Each subscription backs one live assistant"
        pad={false}
        actions={
          <Link
            href={`/dashboard/${orgId}/pricing`}
            className="btn btn--ghost btn--sm"
          >
            <Icon name="plus" size={12} />
            Buy credit
          </Link>
        }
      >
        {subs.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--muted-foreground)",
            }}
          >
            <div style={{ fontSize: 13 }}>No subscriptions yet.</div>
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/dashboard/${orgId}/pricing`}
                className="btn btn--primary btn--sm"
              >
                <Icon name="tag" size={12} />
                See pricing
              </Link>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Status</th>
                <th>Price</th>
                <th>Renews / cancels</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const menuItems: RowMenuItem[] = [
                  ...plans
                    .filter((p) => p.id !== s.planId)
                    .map<RowMenuItem>((p) => ({
                      label: `Switch to ${p.displayName}`,
                      icon: "tag",
                      onClick: () =>
                        changePlan(
                          s.id,
                          p.id,
                          p.priceCents > s.priceCents ? "upgrade" : "downgrade",
                        ),
                    })),
                  { divider: true },
                  {
                    label: "Manage in Stripe",
                    icon: "link",
                    onClick: openPortal,
                  },
                  ...(!s.cancelAtPeriodEnd && s.status !== "canceled"
                    ? [
                        {
                          label: "Cancel subscription",
                          icon: "trash" as const,
                          destructive: true,
                          onClick: () => setConfirmCancel(s.id),
                        } satisfies RowMenuItem,
                      ]
                    : []),
                ];

                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 500 }}>{s.planDisplayName}</span>
                        <span className="mono faint" style={{ fontSize: 11 }}>
                          {s.stripeSubscriptionId.slice(0, 18)}…
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <StatusPill status={s.status} />
                        {s.stripeScheduleId ? (
                          <span className="pill pill--info">downgrade pending</span>
                        ) : null}
                        {s.cancelAtPeriodEnd ? (
                          <span className="pill pill--warn">cancel scheduled</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="mono">
                      {formatMoney(s.priceCents, s.currency)}
                      <span className="faint">/mo</span>
                    </td>
                    <td className="dim mono">
                      {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {formatDate(s.createdAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            setChangingPlanFor(changingPlanFor === s.id ? null : s.id)
                          }
                          disabled={!!busy}
                        >
                          <Icon name="tag" size={12} />
                          {changingPlanFor === s.id ? "Close" : "Change plan"}
                        </button>
                        <RowMenu items={menuItems} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {changingPlanFor ? (
          <div
            style={{
              borderTop: "1px solid var(--db-hair)",
              padding: "14px 18px",
              background: "var(--db-bg-2)",
            }}
          >
            <div className="uc faint" style={{ marginBottom: 10 }}>
              Switch plan
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              }}
            >
              {plans
                .filter((p) => {
                  const sub = subs.find((ss) => ss.id === changingPlanFor);
                  return sub && p.id !== sub.planId;
                })
                .map((p) => {
                  const sub = subs.find((ss) => ss.id === changingPlanFor)!;
                  const isUpgrade = p.priceCents > sub.priceCents;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        border: "1px solid var(--db-hair)",
                        borderRadius: 8,
                        background: "var(--db-surface)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.displayName}</div>
                        <div className="faint" style={{ fontSize: 11 }}>
                          {formatMoney(p.priceCents, p.currency)}/mo ·{" "}
                          {isUpgrade ? "upgrade now" : "downgrade next period"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() =>
                          changePlan(sub.id, p.id, isUpgrade ? "upgrade" : "downgrade")
                        }
                        disabled={busy === sub.id}
                      >
                        Switch
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* Invoices */}
      <div style={{ marginTop: 20 }}>
        <SectionCard
          title="Invoices"
          sub="Paid via Stripe. VAT receipts available on each invoice."
          pad={false}
        >
          {invoices.length === 0 ? (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                color: "var(--muted-foreground)",
                fontSize: 13,
              }}
            >
              No invoices yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">
                      {inv.number ?? inv.stripeInvoiceId.slice(0, 12)}
                    </td>
                    <td className="dim">
                      {inv.issuedAt ? formatDate(inv.issuedAt) : "—"}
                    </td>
                    <td className="mono">{formatMoney(inv.amountDue, inv.currency)}</td>
                    <td>
                      <StatusPill status={inv.status} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {inv.hostedInvoiceUrl ? (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn--ghost btn--sm"
                          >
                            <Icon name="link" size={12} />
                            View
                          </a>
                        ) : null}
                        {inv.invoicePdf ? (
                          <a
                            href={inv.invoicePdf}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn--ghost btn--sm"
                          >
                            <Icon name="download" size={12} />
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* Payment + billing details */}
      <div className="grid2" style={{ marginTop: 20, gap: 20 }}>
        <SectionCard
          title="Payment methods"
          sub={
            isAdmin
              ? "Cards attached to your Stripe customer — add / remove in the portal"
              : "Only org admins can view card details"
          }
          actions={
            isAdmin ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={openPortal}
                disabled={busy === "portal"}
              >
                <Icon name="plus" size={12} />
                {busy === "portal" ? "Opening…" : "Add card"}
              </button>
            ) : null
          }
        >
          {!isAdmin ? (
            <Callout kind="info" icon="lock" title="Admin only">
              Ask an org admin to review cards. You can still see subscriptions and invoices
              above — only the raw card list is restricted.
            </Callout>
          ) : !paymentMethodsLoaded ? (
            <div
              className="faint"
              style={{ fontSize: 13, padding: "8px 0" }}
            >
              Loading cards…
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="faint" style={{ fontSize: 13, lineHeight: 1.55 }}>
              No cards on file. Stripe asks for a card at checkout, so you&rsquo;ll get one
              once you subscribe. You can also add one up-front from the portal.
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={openPortal}
                  disabled={busy === "portal"}
                >
                  <Icon name="link" size={14} />
                  {busy === "portal" ? "Opening…" : "Open Stripe portal"}
                </button>
              </div>
            </div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    border: `1px solid ${pm.isDefault ? "var(--db-hair-strong)" : "var(--db-hair)"}`,
                    borderRadius: 8,
                    background: pm.isDefault ? "var(--db-surface-2)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 28,
                      background:
                        CARD_BRAND_COLORS[pm.brand] ?? CARD_BRAND_COLORS.unknown,
                      borderRadius: 4,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      flexShrink: 0,
                    }}
                  >
                    {brandLabel(pm.brand)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      <span className="mono">•••• •••• •••• {pm.last4 || "••••"}</span>
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      Expires{" "}
                      <span className="mono">
                        {String(pm.expMonth).padStart(2, "0")}/
                        {String(pm.expYear).slice(-2)}
                      </span>
                      {pm.funding ? ` · ${pm.funding}` : null}
                      {pm.country ? ` · ${pm.country.toUpperCase()}` : null}
                    </div>
                  </div>
                  {pm.isDefault ? (
                    <span className="pill pill--active">Default</span>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={openPortal}
                disabled={busy === "portal"}
                style={{ alignSelf: "flex-start", marginTop: 4 }}
              >
                <Icon name="link" size={12} />
                {busy === "portal" ? "Opening…" : "Manage in Stripe"}
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Billing details" sub="Shown on Stripe invoices">
          <dl className="kv">
            <dt>Billed to</dt>
            <dd>Your organization (Clerk)</dd>
            <dt>Currency</dt>
            <dd className="mono">{defaultCurrency}</dd>
            <dt>Tax details</dt>
            <dd className="faint">Add a tax ID from the Stripe portal</dd>
          </dl>
        </SectionCard>
      </div>

      {/* Cancel confirm */}
      {confirmCancel ? (
        <>
          <div
            className="cmdk-scrim"
            onClick={() => setConfirmCancel(null)}
            role="presentation"
          />
          <div className="modal" style={{ width: 420, padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "var(--font-instrument-serif)" }}>
              Cancel at the end of the period?
            </div>
            <div
              className="faint"
              style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}
            >
              Your assistant keeps running until the current billing period ends. After that
              it stops and the credit is released.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmCancel(null)}
              >
                Keep subscription
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => cancelSub(confirmCancel)}
                disabled={busy === confirmCancel}
              >
                <Icon name="trash" size={14} />
                {busy === confirmCancel ? "Cancelling…" : "Cancel at period end"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
