"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import {
  SectionCard,
  Icon,
  Callout,
} from "@/components/dashboard";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
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

function readBenefits(plan: Plan): string[] {
  return Array.isArray(plan.benefits) ? (plan.benefits as string[]) : [];
}

function readHetznerSpec(plan: Plan) {
  const spec = plan.providerSpec as
    | { hetzner?: { serverType?: string; cpu?: string; mem?: string; disk?: string } }
    | undefined;
  // Server type (cx33 etc.) is an internal Hetzner detail — omit it from the
  // public pricing surface. Only the user-facing cpu/mem/disk appear.
  const h = spec?.hetzner;
  if (!h) return null;
  return { cpu: h.cpu, mem: h.mem, disk: h.disk };
}

function hasStripePrice(plan: Plan) {
  const ids = plan.billingProviderIds as { stripePriceId?: string } | undefined;
  return typeof ids?.stripePriceId === "string";
}

function planSpecsLine(spec: ReturnType<typeof readHetznerSpec>): string | null {
  if (!spec) return null;
  return [spec.cpu, spec.mem, spec.disk].filter(Boolean).join(" · ") || null;
}

export default function PricingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

  const load = useCallback(async () => {
    try {
      const pRes = await rpc.api.plans.$get();
      if (pRes.ok) {
        const d = (await pRes.json()) as { plans: Plan[] };
        setPlans(d.plans);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.tier - b.tier), [plans]);

  // Build the union of every benefit listed across plans. For each card we
  // show the plan's own benefits with a check, and everything else in the
  // union with a cross — makes the tier differences obvious at a glance.
  const allBenefits = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of sortedPlans) {
      for (const b of readBenefits(p)) seen.set(b.toLowerCase(), b);
    }
    return [...seen.values()];
  }, [sortedPlans]);

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
      <div>
        <div className="page__head">
          <div>
            <h1 className="page__title">
              Buy a{" "}
              <span className="accent font-[var(--font-instrument-serif)]">
                subscription
              </span>
            </h1>
          </div>
        </div>
        <div className="grid4 gap-[18px] mb-[26px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="plan" aria-busy="true">
              <Skeleton className="h-5 w-24 mb-2" />
              <Skeleton className="h-4 w-40 mb-4" />
              <Skeleton className="h-10 w-28 mb-4" />
              <div className="h-px bg-border my-1.5" />
              <div className="space-y-2 py-2">
                <Skeleton className="h-3 w-[80%]" />
                <Skeleton className="h-3 w-[70%]" />
                <Skeleton className="h-3 w-[85%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
              <Skeleton className="h-8 w-full mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Buy a{" "}
            <span className="accent font-[var(--font-instrument-serif)]">
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
          <div className="grid4 gap-[18px] mb-[26px]">
            {sortedPlans.map((p) => {
              const isSel = selected === p.id;
              const hetz = readHetznerSpec(p);
              const specsLine = planSpecsLine(hetz);
              const ownBenefits = readBenefits(p);
              const ownBenefitsSet = new Set(ownBenefits.map((b) => b.toLowerCase()));
              const missing = allBenefits.filter((b) => !ownBenefitsSet.has(b.toLowerCase()));
              const stripeReady = hasStripePrice(p);
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  className={`plan cursor-pointer text-left${p.popular ? " is-pop" : ""}${isSel && !p.popular ? " is-pop" : ""}`}
                  onClick={() => setSelected(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(p.id);
                    }
                  }}
                >
                  {p.popular ? <div className="plan__ribbon">Most popular</div> : null}

                  <div>
                    <div className="plan__name">{p.displayName}</div>
                    {p.tagline ? (
                      <div className="text-[13px] text-muted-foreground mt-[3px]">
                        {p.tagline}
                      </div>
                    ) : null}
                  </div>

                  {specsLine ? <div className="plan__specs">{specsLine}</div> : null}

                  <div className="plan__price">
                    <span className="amt">{formatPrice(p.priceCents, p.currency)}</span>
                    <span className="unit">/mo</span>
                  </div>

                  <div className="h-px bg-border my-1.5" />

                  <div className="plan__benefits">
                    {ownBenefits.map((b) => (
                      <div key={`y-${b}`} className="plan__benefit">
                        <span className="ch">
                          <Icon name="check" size={14} />
                        </span>
                        {b}
                      </div>
                    ))}
                    {missing.map((b) => (
                      <div key={`n-${b}`} className="plan__benefit off">
                        <span className="ch">
                          <Icon name="x" size={14} />
                        </span>
                        {b}
                      </div>
                    ))}
                  </div>

                  {!stripeReady ? (
                    <div className="faint text-[11px] mt-1 font-mono">
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
                    aria-busy={checkoutFor === p.id || undefined}
                  >
                    {isSel ? (
                      <>
                        {checkoutFor === p.id ? (
                          <Spinner size="xs" />
                        ) : (
                          <Icon name="zap" size={14} />
                        )}
                        Subscribe →
                      </>
                    ) : (
                      `Select ${p.displayName}`
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {checkoutError ? (
            <div className="mb-4">
              <Callout kind="danger" icon="alert" title="Checkout failed">
                {checkoutError}
              </Callout>
            </div>
          ) : null}
        </>
      )}

      <div className="grid2 gap-5">
        <SectionCard title="How subscriptions work">
          <div className="col gap-[14px] text-[13px] leading-[1.6] text-muted-foreground">
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
              <div key={n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary grid place-items-center font-bold shrink-0 text-xs">
                  {n}
                </div>
                <div>
                  <b className="text-foreground">{strong}</b>
                  {rest}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="FAQ">
          <div className="col gap-[14px] text-[13px]">
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
                <div className="font-medium mb-[3px]">{q}</div>
                <div className="dim text-xs leading-[1.6]">
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
