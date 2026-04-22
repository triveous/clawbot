"use client";

import { useState, useEffect, useCallback } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  tier: number;
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  trialing: "secondary",
  incomplete: "outline",
  past_due: "destructive",
  unpaid: "destructive",
  canceled: "outline",
  paid: "default",
  open: "secondary",
  void: "outline",
  uncollectible: "destructive",
  draft: "outline",
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function BillingPage() {
  const rpc = useRpc();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [changingPlanFor, setChangingPlanFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [subRes, invRes, planRes] = await Promise.all([
        rpc.api.billing.subscriptions.$get(),
        rpc.api.billing.invoices.$get(),
        rpc.api.plans.$get(),
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
    } catch {
      setError("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!confirm("Cancel at the end of the current period?")) return;
    setBusy(subId);
    try {
      const res = await rpc.api.billing.subscriptions[":id"].cancel.$post({
        param: { id: subId },
      });
      if (res.ok) await load();
      else setError("Cancel failed");
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
      const res = await fetch(
        `/api/billing/subscriptions/${subId}/change-plan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newPlanId, mode }),
        },
      );
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

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Subscriptions, invoices, and payment method.
          </p>
        </div>
        <Button onClick={openPortal} disabled={busy === "portal"} variant="outline">
          {busy === "portal" ? "Opening…" : "Manage payment method"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Subscriptions</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active subscriptions. Visit Pricing to subscribe.
          </p>
        ) : (
          <div className="space-y-2">
            {subs.map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>
                        {s.status}
                      </Badge>
                      <span className="font-medium">{s.planDisplayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(s.priceCents, s.currency)}/mo
                      </span>
                      {s.currentPeriodEnd && (
                        <span className="text-xs text-muted-foreground">
                          {s.cancelAtPeriodEnd ? "Cancels" : "Renews"}{" "}
                          {new Date(s.currentPeriodEnd).toLocaleDateString()}
                        </span>
                      )}
                      {s.stripeScheduleId && (
                        <Badge variant="secondary" className="text-xs">
                          downgrade pending
                        </Badge>
                      )}
                      {s.cancelAtPeriodEnd && (
                        <Badge variant="outline" className="text-xs">
                          cancel scheduled
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setChangingPlanFor(
                            changingPlanFor === s.id ? null : s.id,
                          )
                        }
                        disabled={!!busy}
                      >
                        {changingPlanFor === s.id ? "Cancel" : "Change plan"}
                      </Button>
                      {!s.cancelAtPeriodEnd && s.status !== "canceled" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => cancelSub(s.id)}
                          disabled={busy === s.id}
                        >
                          {busy === s.id ? "…" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {changingPlanFor === s.id && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">Switch to</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {plans
                          .filter((p) => p.id !== s.planId)
                          .map((p) => {
                            const isUpgrade = p.priceCents > s.priceCents;
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                              >
                                <div>
                                  <div className="text-sm font-medium">
                                    {p.displayName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatMoney(p.priceCents, s.currency)}/mo ·{" "}
                                    {isUpgrade ? "upgrade now" : "downgrade next period"}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    changePlan(
                                      s.id,
                                      p.id,
                                      isUpgrade ? "upgrade" : "downgrade",
                                    )
                                  }
                                  disabled={busy === s.id}
                                >
                                  Switch
                                </Button>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>
                      {inv.status}
                    </Badge>
                    <span className="font-mono text-xs">
                      {inv.number ?? inv.stripeInvoiceId.slice(0, 12)}
                    </span>
                    {inv.issuedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(inv.issuedAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-sm">
                      {formatMoney(inv.amountDue, inv.currency)}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        View
                      </a>
                    )}
                    {inv.invoicePdf && (
                      <a
                        href={inv.invoicePdf}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
