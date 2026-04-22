"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import {
  SectionCard,
  Icon,
  Callout,
} from "@/components/dashboard";
import { formatPrice } from "@/lib/dashboard/format";

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  tier: number;
  benefits: unknown;
  resourceLimits: unknown;
  billingProviderIds: unknown;
  providerSpec: unknown;
  popular?: boolean;
};

type Credit = {
  planId: string;
  status: string;
  consumedByAssistantId: string | null;
  currentPeriodEnd: string | null;
};

function readBenefits(plan: Plan) {
  return Array.isArray(plan.benefits) ? (plan.benefits as string[]) : [];
}

function readHetznerSpec(plan: Plan) {
  const spec = plan.providerSpec as
    | { hetzner?: { serverType?: string; cpu?: string; mem?: string; disk?: string } }
    | undefined;
  return spec?.hetzner;
}

function hasStripePrice(plan: Plan) {
  const ids = plan.billingProviderIds as { stripePriceId?: string } | undefined;
  return typeof ids?.stripePriceId === "string";
}

export default function PricingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        rpc.api.plans.$get(),
        rpc.api.credits.$get(),
      ]);
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
    void load();
  }, [load]);

  const creditByPlan = new Map<string, number>();
  const now = Date.now();
  for (const c of credits) {
    if (
      c.status === "active" &&
      !c.consumedByAssistantId &&
      c.currentPeriodEnd &&
      new Date(c.currentPeriodEnd).getTime() > now
    ) {
      creditByPlan.set(c.planId, (creditByPlan.get(c.planId) ?? 0) + 1);
    }
  }

  const sortedPlans = [...plans].sort((a, b) => a.tier - b.tier);

  async function startCheckout(planId: string) {
    setCheckoutFor(planId);
    setCheckoutError("");
    try {
      const res = await rpc.api.billing.checkout.$post({ json: { planId } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setCheckoutError(body.message ?? "Couldn't start checkout");
        setCheckoutFor(null);
        return;
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setCheckoutError("Couldn't start checkout");
      setCheckoutFor(null);
    }
  }

  if (loading) {
    return (
      <div className="page__loading">
        <Icon name="tag" size={20} />
        Loading plans…
      </div>
    );
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Buy a{" "}
            <span className="accent" style={{ fontFamily: "var(--font-instrument-serif)" }}>
              subscription
            </span>
          </h1>
          <div className="page__sub">
            Pick a tier. Pay monthly, cancel anytime. Each subscription is a slot for one live
            assistant.
          </div>
        </div>
        <div className="page__actions">
          <Link href={`/dashboard/${orgId}/billing`} className="btn btn--ghost">
            <Icon name="arrowLeft" size={14} />
            Back to billing
          </Link>
        </div>
      </div>

      {sortedPlans.length === 0 ? (
        <Callout kind="warn" icon="alert" title="No plans configured">
          A platform admin needs to create plans in the Admin console before you can subscribe.
        </Callout>
      ) : (
        <>
          <div className="grid4" style={{ gap: 18, marginBottom: 26 }}>
            {sortedPlans.map((p) => {
              const isSel = selected === p.id;
              const hetz = readHetznerSpec(p);
              const benefits = readBenefits(p);
              const owned = creditByPlan.get(p.id) ?? 0;
              const stripeReady = hasStripePrice(p);
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`plan${p.popular ? " is-pop" : ""}${isSel && !p.popular ? " is-pop" : ""}`}
                  onClick={() => setSelected(p.id)}
                >
                  {p.popular ? <div className="plan__ribbon">Most popular</div> : null}
                  <div>
                    <div className="plan__name">{p.displayName}</div>
                    {p.tagline ? (
                      <div style={{ fontSize: 13, color: "var(--db-text-dim)", marginTop: 3 }}>
                        {p.tagline}
                      </div>
                    ) : null}
                  </div>
                  <div className="plan__price">
                    <span className="amt">{formatPrice(p.priceCents, p.currency)}</span>
                    <span className="unit">/mo</span>
                  </div>
                  {hetz ? (
                    <div className="plan__specs">
                      {[hetz.serverType, hetz.cpu, hetz.mem, hetz.disk].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                  <div
                    style={{
                      height: 1,
                      background: "var(--db-hair)",
                      margin: "6px 0",
                    }}
                  />
                  <div className="plan__benefits">
                    {benefits.length > 0 ? (
                      benefits.map((b, i) => (
                        <div key={i} className="plan__benefit">
                          <span className="ch">
                            <Icon name="check" size={14} />
                          </span>
                          {b}
                        </div>
                      ))
                    ) : (
                      <div className="plan__benefit">
                        <span className="ch">
                          <Icon name="check" size={14} />
                        </span>
                        OpenClaw pre-installed
                      </div>
                    )}
                    {owned > 0 ? (
                      <div className="plan__benefit">
                        <span className="ch">
                          <Icon name="coins" size={14} />
                        </span>
                        You already have {owned} credit{owned > 1 ? "s" : ""} ready
                      </div>
                    ) : null}
                  </div>

                  {!stripeReady ? (
                    <div
                      className="faint"
                      style={{
                        fontSize: 11,
                        marginTop: 8,
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      Stripe price not configured — ask an admin.
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={`btn ${isSel ? "btn--primary" : "btn--subtle"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!stripeReady) return;
                      if (isSel) void startCheckout(p.id);
                      else setSelected(p.id);
                    }}
                    disabled={!stripeReady || checkoutFor === p.id}
                  >
                    {isSel ? (
                      <>
                        <Icon name="zap" size={14} />
                        {checkoutFor === p.id ? "Redirecting…" : "Subscribe →"}
                      </>
                    ) : (
                      `Select ${p.displayName}`
                    )}
                  </button>
                </button>
              );
            })}
          </div>

          {checkoutError ? (
            <div style={{ marginBottom: 16 }}>
              <Callout kind="danger" icon="alert" title="Checkout failed">
                {checkoutError}
              </Callout>
            </div>
          ) : null}
        </>
      )}

      <div className="grid2" style={{ gap: 20 }}>
        <SectionCard title="How subscriptions work">
          <div
            className="col"
            style={{
              gap: 14,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--db-text-dim)",
            }}
          >
            {[
              [
                "1",
                "You buy a subscription",
                "at a chosen tier. We charge the card monthly via Stripe.",
              ],
              [
                "2",
                "You attach it to an assistant",
                ". We provision a Hetzner server matching that tier.",
              ],
              [
                "3",
                "Delete the assistant",
                " and the credit comes back to your pool, ready to attach to something else.",
              ],
            ].map(([n, strong, rest]) => (
              <div key={n} style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: "var(--db-red-dim)",
                    color: "var(--db-red)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                    fontSize: 12,
                  }}
                >
                  {n}
                </div>
                <div>
                  <b style={{ color: "var(--db-text)" }}>{strong}</b>
                  {rest}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="FAQ">
          <div className="col" style={{ gap: 14, fontSize: 13 }}>
            {[
              [
                "Can I mix tiers?",
                "Yes. Each subscription is tied to one plan, but you can hold different tiers side by side.",
              ],
              [
                "What happens if I cancel?",
                "We keep the assistant running until the end of the billing period, then stop the server. Your data volume is kept for 30 days.",
              ],
              [
                "Any usage fees?",
                "No. You pay a flat fee for the server. Model API costs are billed separately by your model provider — we don't mark them up.",
              ],
            ].map(([q, a]) => (
              <div key={q}>
                <div style={{ fontWeight: 500, marginBottom: 3 }}>{q}</div>
                <div className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {a}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
