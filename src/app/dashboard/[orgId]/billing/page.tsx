"use client";

import { use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import {
  SkeletonKPI,
  SkeletonTable,
  SkeletonText,
} from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useAsyncAction } from "@/hooks/use-async-action";
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

type StripeCustomer =
  | { configured: false }
  | {
      configured: true;
      customerId: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      currency: string | null;
      address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
      } | null;
      taxIds: { id: string; type: string; value: string; country: string | null }[];
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
  subscriptionId: string | null;
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
  const [customer, setCustomer] = useState<StripeCustomer | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [changingPlanFor, setChangingPlanFor] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [pendingSubId, setPendingSubId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [subRes, invRes, planRes, creditRes, asstRes] = await Promise.all([
      rpc.api.billing.subscriptions.$get(),
      rpc.api.billing.invoices.$get(),
      rpc.api.plans.$get(),
      rpc.api.credits.$get(),
      rpc.api.assistants.$get(),
    ]);
    if (!subRes.ok || !invRes.ok || !planRes.ok || !creditRes.ok || !asstRes.ok) {
      throw new Error("Failed to load billing data");
    }
    const subData = (await subRes.json()) as { subscriptions: Subscription[] };
    const invData = (await invRes.json()) as { invoices: Invoice[] };
    const planData = (await planRes.json()) as { plans: Plan[] };
    const creditData = (await creditRes.json()) as { credits: Credit[] };
    const asstData = (await asstRes.json()) as { assistants: Assistant[] };
    setSubs(subData.subscriptions);
    setInvoices(invData.invoices);
    setPlans(planData.plans);
    setCredits(creditData.credits);
    setAssistants(asstData.assistants);
  }, [rpc]);

  const load = useAsyncAction(fetchAll, {
    successToast: false,
    errorToast: false,
  });

  const loadPaymentMethods = useCallback(async () => {
    setPaymentMethodsLoaded(false);
    try {
      const [pmRes, custRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rpc.api.billing as any)["payment-methods"].$get(),
        rpc.api.billing.customer.$get(),
      ]);
      if (pmRes.ok) {
        const data = (await pmRes.json()) as { paymentMethods: PaymentMethod[] };
        setPaymentMethods(data.paymentMethods);
      }
      if (custRes.ok) {
        const data = (await custRes.json()) as StripeCustomer;
        setCustomer(data);
      }
    } finally {
      setPaymentMethodsLoaded(true);
    }
  }, [rpc]);

  useEffect(() => {
    void load.run().finally(() => setFirstLoad(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);

  // Sort credits by status priority (past-due first, then active, then other)
  // so trouble surfaces at the top of the unified table.
  const sortedCredits = useMemo(() => {
    const weight = (status: string): number => {
      if (status === "past_due" || status === "unpaid") return 0;
      if (status === "active" || status === "trialing") return 1;
      if (status === "incomplete") return 2;
      return 3;
    };
    return [...credits].sort((a, b) => weight(a.status) - weight(b.status));
  }, [credits]);

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

  const openPortal = useAsyncAction(
    async () => {
      const res = await rpc.api.billing.portal.$post();
      if (!res.ok) throw new Error("Could not open Stripe portal");
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    },
    { errorToast: "Could not open Stripe portal" },
  );

  const cancelSub = useAsyncAction(
    async (subId: string) => {
      const res = await rpc.api.billing.subscriptions[":id"].cancel.$post({
        param: { id: subId },
      });
      if (!res.ok) throw new Error("Cancel failed");
      setConfirmCancel(null);
      await fetchAll();
    },
    {
      successToast: "Subscription cancellation scheduled",
      errorToast: "Could not cancel — try again",
    },
  );

  const changePlan = useAsyncAction(
    async (subId: string, newPlanId: string, mode: "upgrade" | "downgrade") => {
      const res = await fetch(`/api/billing/subscriptions/${subId}/change-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPlanId, mode }),
      });
      if (!res.ok) throw new Error("Plan change failed");
      setChangingPlanFor(null);
      await fetchAll();
    },
    {
      successToast: "Plan changed",
      errorToast: "Could not change plan — try again",
    },
  );

  if (firstLoad) {
    return (
      <div>
        <div className="page__head">
          <div>
            <h1 className="page__title">
              Billing{" "}
              <span className="accent font-[var(--font-instrument-serif)]">
                &amp; credits
              </span>
            </h1>
            <div className="page__sub">
              Credits are what you buy. One credit → one live assistant.
            </div>
          </div>
        </div>
        <SkeletonKPI count={4} className="mb-5" />
        <SkeletonTable rows={4} cols={6} />
        <div className="mt-5">
          <SkeletonTable rows={3} cols={5} />
        </div>
      </div>
    );
  }

  if (load.error && subs.length === 0 && invoices.length === 0) {
    return (
      <div>
        <div className="page__head">
          <div>
            <h1 className="page__title">Billing</h1>
          </div>
        </div>
        <Callout kind="danger" icon="alert" title="Couldn't load billing data">
          {load.error.message}
          <div className="mt-2.5">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void load.run()}
              disabled={load.loading}
            >
              {load.loading ? (
                <Spinner size="xs" />
              ) : (
                <Icon name="refresh" size={12} />
              )}
              Retry
            </button>
          </div>
        </Callout>
      </div>
    );
  }

  return (
    <div className="relative">
      <ProgressBar active={!firstLoad && load.loading} />
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Billing{" "}
            <span className="accent font-[var(--font-instrument-serif)]">
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
            onClick={() => void openPortal.run()}
            disabled={openPortal.loading}
            aria-busy={openPortal.loading || undefined}
          >
            {openPortal.loading ? <Spinner size="xs" /> : <Icon name="creditCard" size={14} />}
            Manage payment
          </button>
          <Link href={`/dashboard/${orgId}/pricing`} className="btn btn--primary">
            <Icon name="plus" size={14} />
            Buy credit
          </Link>
        </div>
      </div>

      {pastDue.length > 0 ? (
        <div className="mb-4">
          <Callout
            kind="danger"
            icon="alert"
            title={`${pastDue.length} subscription${pastDue.length > 1 ? "s" : ""} past due`}
          >
            Assistant is paused until payment is collected. Update your card from the Stripe
            portal to resume.
            <div className="mt-2.5">
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => void openPortal.run()}
                disabled={openPortal.loading}
                aria-busy={openPortal.loading || undefined}
              >
                {openPortal.loading ? <Spinner size="xs" /> : <Icon name="creditCard" size={12} />}
                Update payment method
              </button>
            </div>
          </Callout>
        </div>
      ) : null}

      {/* Stat strip */}
      <div className="grid4 mb-5">
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
          <div className="faint text-[11px] mt-[3px] font-mono">
            {consumedCredits} in use · {availableCredits} available
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Next charge</div>
          <div className="stat__value">
            {nextChargeDate ? formatDate(nextChargeDate) : "—"}
          </div>
          <div className="faint text-[11px] mt-[3px] font-mono">
            {activeSubs.length > 0
              ? `${formatMoney(monthlyTotal, defaultCurrency)} via Stripe`
              : "no active subs"}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Lifetime paid</div>
          <div className="stat__value">{formatMoney(lifetimeCents, defaultCurrency)}</div>
          <div className="faint text-[11px] mt-[3px] font-mono">
            {invoices.filter((i) => i.status === "paid").length} paid invoices
          </div>
        </div>
      </div>

      {/* Merged Credits ↔ Subscriptions table. Each row is a credit — a
          pre-paid slot for one assistant. Credits backed by a Stripe
          subscription also expose the subscription-level actions (change
          plan, cancel, manage in Stripe) inline on the same row. */}
      <SectionCard
        title="Credits"
        sub="Each credit is a pre-paid slot for one assistant. Manage subscription actions inline."
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
        {sortedCredits.length === 0 ? (
          <div className="py-10 px-6 text-center text-muted-foreground">
            <div className="text-[13px]">No credits yet.</div>
            <div className="mt-3">
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
                <th>Attached to</th>
                <th>Renews</th>
                <th>Source</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCredits.map((c) => {
                const plan = planById.get(c.planId);
                const sub = c.subscriptionId ? subById.get(c.subscriptionId) : null;
                const attached = c.consumedByAssistantId
                  ? assistantById.get(c.consumedByAssistantId)
                  : null;

                // Primary action varies by state; overflow menu always surfaces
                // the full set for completeness.
                const primary = (() => {
                  if (c.status === "past_due" || c.status === "unpaid") {
                    return (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => void openPortal.run()}
                        disabled={openPortal.loading}
                        aria-busy={openPortal.loading || undefined}
                      >
                        {openPortal.loading ? (
                          <Spinner size="xs" />
                        ) : (
                          <Icon name="creditCard" size={12} />
                        )}
                        Pay now
                      </button>
                    );
                  }
                  if (attached) {
                    return (
                      <Link
                        href={`/dashboard/${orgId}/assistant/${attached.id}`}
                        className="btn btn--ghost btn--sm"
                      >
                        <Icon name="bot" size={12} />
                        Open
                      </Link>
                    );
                  }
                  if (
                    (c.status === "active" || c.status === "trialing") &&
                    !c.consumedByAssistantId
                  ) {
                    return (
                      <Link
                        href={`/dashboard/${orgId}`}
                        className="btn btn--primary btn--sm"
                      >
                        <Icon name="zap" size={12} />
                        Attach
                      </Link>
                    );
                  }
                  return null;
                })();

                const menuItems: RowMenuItem[] = [];

                if (sub) {
                  menuItems.push({
                    label: changingPlanFor === sub.id ? "Close switch plan" : "Change plan",
                    icon: "tag",
                    onClick: () =>
                      setChangingPlanFor(
                        changingPlanFor === sub.id ? null : sub.id,
                      ),
                  });
                  menuItems.push({
                    label: "Manage in Stripe",
                    icon: "link",
                    onClick: () => void openPortal.run(),
                  });
                  if (!sub.cancelAtPeriodEnd && sub.status !== "canceled") {
                    menuItems.push({ divider: true });
                    menuItems.push({
                      label: "Cancel subscription",
                      icon: "trash",
                      destructive: true,
                      onClick: () => setConfirmCancel(sub.id),
                    });
                  }
                } else if (attached) {
                  menuItems.push({
                    label: "Open assistant",
                    icon: "bot",
                    onClick: () => {
                      window.location.href = `/dashboard/${orgId}/assistant/${attached.id}`;
                    },
                  });
                }

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{plan?.displayName ?? "—"}</span>
                        <span className="mono faint text-[11px]">
                          {plan ? `${formatMoney(plan.priceCents, plan.currency)}/mo` : c.id.slice(0, 10)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1.5 items-center flex-wrap">
                        <StatusPill status={c.status} />
                        {sub?.stripeScheduleId ? (
                          <span className="pill pill--info">downgrade pending</span>
                        ) : null}
                        {sub?.cancelAtPeriodEnd ? (
                          <span className="pill pill--warn">cancel scheduled</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {attached ? (
                        <Link
                          href={`/dashboard/${orgId}/assistant/${attached.id}`}
                          className="inline-flex items-center gap-1.5 text-[13px]"
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
                    <td className="dim text-xs">
                      {c.source === "stripe" ? (
                        "Stripe"
                      ) : c.source === "granted" ? (
                        <span className="pill pill--info">Granted</span>
                      ) : (
                        c.source
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex gap-1.5 justify-end items-center">
                        {primary}
                        {menuItems.length > 0 ? <RowMenu items={menuItems} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {changingPlanFor ? (
          <div className="border-t border-border px-[18px] py-[14px] bg-muted">
            <div className="uc faint mb-2.5">
              Switch plan
            </div>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
              {plans
                .filter((p) => {
                  const sub = subById.get(changingPlanFor);
                  return sub && p.id !== sub.planId;
                })
                .map((p) => {
                  const sub = subById.get(changingPlanFor);
                  if (!sub) return null;
                  const isUpgrade = p.priceCents > sub.priceCents;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-lg bg-card"
                    >
                      <div>
                        <div className="text-[13px] font-medium">
                          {p.displayName}
                        </div>
                        <div className="faint text-[11px]">
                          {formatMoney(p.priceCents, p.currency)}/mo ·{" "}
                          {isUpgrade ? "upgrade now" : "downgrade next period"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={async () => {
                          setPendingSubId(sub.id);
                          try {
                            await changePlan.run(
                              sub.id,
                              p.id,
                              isUpgrade ? "upgrade" : "downgrade",
                            );
                          } finally {
                            setPendingSubId(null);
                          }
                        }}
                        disabled={pendingSubId === sub.id && changePlan.loading}
                        aria-busy={
                          pendingSubId === sub.id && changePlan.loading
                            ? true
                            : undefined
                        }
                      >
                        {pendingSubId === sub.id && changePlan.loading ? (
                          <Spinner size="xs" />
                        ) : (
                          <Icon name="chevRight" size={12} />
                        )}
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
      <div className="mt-5">
        <SectionCard
          title="Invoices"
          sub="Paid via Stripe. VAT receipts available on each invoice."
          pad={false}
        >
          {invoices.length === 0 ? (
            <div className="py-8 px-6 text-center text-muted-foreground text-[13px]">
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
                    <td className="text-right">
                      <div className="flex gap-1.5 justify-end">
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
      <div className="grid2 mt-5 gap-5">
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
                onClick={() => void openPortal.run()}
                disabled={openPortal.loading}
                aria-busy={openPortal.loading || undefined}
              >
                {openPortal.loading ? <Spinner size="xs" /> : <Icon name="plus" size={12} />}
                Add card
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
            <SkeletonTable rows={2} cols={2} />
          ) : paymentMethods.length === 0 ? (
            <div className="faint text-[13px] leading-[1.55]">
              No cards on file. Stripe asks for a card at checkout, so you&rsquo;ll get one
              once you subscribe. You can also add one up-front from the portal.
              <div className="mt-[14px]">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void openPortal.run()}
                  disabled={openPortal.loading}
                  aria-busy={openPortal.loading || undefined}
                >
                  {openPortal.loading ? <Spinner size="xs" /> : <Icon name="link" size={14} />}
                  Open Stripe portal
                </button>
              </div>
            </div>
          ) : (
            <div className="col gap-2.5">
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg ${pm.isDefault ? "border-foreground/20 bg-muted" : "border-border bg-transparent"}`}
                >
                  <div
                    className="w-[42px] h-7 rounded grid place-items-center text-white text-[10px] font-bold tracking-[0.04em] shrink-0"
                    style={{
                      background:
                        CARD_BRAND_COLORS[pm.brand] ?? CARD_BRAND_COLORS.unknown,
                    }}
                  >
                    {brandLabel(pm.brand)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">
                      <span className="mono">•••• •••• •••• {pm.last4 || "••••"}</span>
                    </div>
                    <div className="faint text-[11px]">
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
                className="btn btn--ghost btn--sm self-start mt-1"
                onClick={() => void openPortal.run()}
                disabled={openPortal.loading}
                aria-busy={openPortal.loading || undefined}
              >
                {openPortal.loading ? <Spinner size="xs" /> : <Icon name="link" size={12} />}
                Manage in Stripe
              </button>
            </div>
          )}
        </SectionCard>

        <BillingDetailsCard
          isAdmin={isAdmin}
          customer={customer}
          defaultCurrency={defaultCurrency}
          onOpenPortal={() => void openPortal.run()}
          openingPortal={openPortal.loading}
        />
      </div>

      {/* Cancel confirm */}
      {confirmCancel ? (
        <>
          <div
            className="cmdk-scrim"
            onClick={() => setConfirmCancel(null)}
            role="presentation"
          />
          <div className="modal w-[420px] p-7">
            <div className="text-[18px] font-medium font-[var(--font-instrument-serif)]">
              Cancel at the end of the period?
            </div>
            <div className="faint text-[13px] mt-2 leading-[1.6]">
              Your assistant keeps running until the current billing period ends. After that
              it stops and the credit is released.
            </div>
            <div className="flex gap-2 mt-5 justify-end">
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
                onClick={async () => {
                  const id = confirmCancel;
                  if (!id) return;
                  setPendingSubId(id);
                  try {
                    await cancelSub.run(id);
                  } finally {
                    setPendingSubId(null);
                  }
                }}
                disabled={pendingSubId === confirmCancel && cancelSub.loading}
                aria-busy={
                  pendingSubId === confirmCancel && cancelSub.loading
                    ? true
                    : undefined
                }
              >
                {pendingSubId === confirmCancel && cancelSub.loading ? (
                  <Spinner size="xs" />
                ) : (
                  <Icon name="trash" size={14} />
                )}
                Cancel at period end
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TAX_LABEL(type: string): string {
  // Stripe tax_id type strings follow a `<country>_<kind>` convention. Upper-
  // case + split on underscore is readable enough without shipping a
  // pages-long lookup.
  return type.replace(/_/g, " ").toUpperCase();
}

function BillingDetailsCard({
  isAdmin,
  customer,
  defaultCurrency,
  onOpenPortal,
  openingPortal,
}: {
  isAdmin: boolean;
  customer: StripeCustomer | null;
  defaultCurrency: string;
  onOpenPortal: () => void;
  openingPortal: boolean;
}) {
  if (!isAdmin) {
    return (
      <SectionCard title="Billing details" sub="Only org admins can view billing identity">
        <Callout kind="info" icon="lock" title="Admin only">
          The name, address, and tax identifiers we print on Stripe invoices are visible to
          org admins only. Ask an admin to update them.
        </Callout>
      </SectionCard>
    );
  }

  // Loading — the admin fetch hasn't resolved yet.
  if (customer === null) {
    return (
      <SectionCard title="Billing details" sub="Shown on Stripe invoices">
        <SkeletonText lines={4} />
      </SectionCard>
    );
  }

  if (!customer.configured) {
    return (
      <SectionCard
        title="Billing details"
        sub="Stripe customer not configured yet"
        actions={
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onOpenPortal}
            disabled={openingPortal}
            aria-busy={openingPortal || undefined}
          >
            {openingPortal ? <Spinner size="xs" /> : <Icon name="link" size={12} />}
            Configure
          </button>
        }
      >
        <div className="faint text-[13px] leading-[1.55]">
          Stripe creates a customer record on your first checkout. Once it exists, your billing
          identity (name, email, address, tax IDs) will show up here — and on every invoice.
        </div>
      </SectionCard>
    );
  }

  const { name, email, phone, address, taxIds } = customer;
  const currency = (customer.currency ?? defaultCurrency).toUpperCase();
  const addressLines = address
    ? [
        address.line1,
        address.line2,
        [address.city, address.state, address.postalCode].filter(Boolean).join(", ") || null,
        address.country,
      ].filter((l): l is string => !!l)
    : [];

  // Only render rows whose Stripe values are populated; skip anything missing
  // so the card doesn't read as "billing details: blank".
  const rows: { label: string; value: ReactNode }[] = [];
  if (name) rows.push({ label: "Billed to", value: name });
  if (email)
    rows.push({
      label: "Email",
      value: <span className="mono">{email}</span>,
    });
  if (phone)
    rows.push({
      label: "Phone",
      value: <span className="mono">{phone}</span>,
    });
  if (addressLines.length > 0) {
    rows.push({
      label: "Address",
      value: (
        <div>
          {addressLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ),
    });
  }
  rows.push({
    label: "Currency",
    value: <span className="mono">{currency}</span>,
  });
  if (taxIds.length > 0) {
    rows.push({
      label: taxIds.length > 1 ? "Tax IDs" : "Tax ID",
      value: (
        <div className="col gap-1">
          {taxIds.map((t) => (
            <div key={t.id}>
              <span className="mono">{t.value}</span>{" "}
              <span className="faint text-[11px]">
                · {TAX_LABEL(t.type)}
                {t.country ? ` · ${t.country}` : ""}
              </span>
            </div>
          ))}
        </div>
      ),
    });
  }

  return (
    <SectionCard
      title="Billing details"
      sub="Shown on Stripe invoices"
      actions={
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onOpenPortal}
          disabled={openingPortal}
          aria-busy={openingPortal || undefined}
        >
          {openingPortal ? <Spinner size="xs" /> : <Icon name="edit" size={12} />}
          Edit in Stripe
        </button>
      }
    >
      <dl className="kv">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
