import { getPlan } from "@/lib/plans/catalog";
import type { Organization } from "@/lib/db/schema";
import { getStripe } from "./client";
import { ensureStripeCustomer } from "./customers";

function readStripePriceId(plan: { billingProviderIds: Record<string, unknown> }): string {
  const id = plan.billingProviderIds.stripePriceId;
  if (typeof id !== "string" || !id) {
    throw new Error("Plan has no Stripe price configured");
  }
  return id;
}

export async function createCheckoutSession(opts: {
  org: Organization;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const plan = await getPlan(opts.planId);
  if (!plan) throw new Error(`Plan ${opts.planId} not found`);

  const priceId = readStripePriceId(plan);
  const customerId = await ensureStripeCustomer(opts.org);

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { orgId: opts.org.id, planId: opts.planId },
    subscription_data: {
      metadata: { orgId: opts.org.id, planId: opts.planId },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return { url: session.url };
}

export async function createPortalSession(opts: {
  org: Organization;
  returnUrl: string;
}): Promise<{ url: string }> {
  const customerId = await ensureStripeCustomer(opts.org);
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: opts.returnUrl,
  });
  return { url: session.url };
}
