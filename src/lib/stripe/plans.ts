import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import type { Plan } from "@/lib/db/schema";
import { invalidatePlanCache } from "@/lib/plans/catalog";
import { getStripe } from "./client";

type BillingIds = {
  stripeProductId?: string;
  stripePriceId?: string;
  archivedPriceIds?: string[];
};

function readBillingIds(plan: Plan): BillingIds {
  return (plan.billingProviderIds ?? {}) as BillingIds;
}

async function writeBillingIds(planId: string, ids: BillingIds): Promise<void> {
  await db
    .update(plans)
    .set({ billingProviderIds: ids as unknown as Record<string, string> })
    .where(eq(plans.id, planId));
  invalidatePlanCache();
}

/**
 * Create a Stripe Product + monthly recurring Price for a plan and persist
 * the IDs into `plans.billingProviderIds`.
 */
export async function createStripePlanArtifacts(plan: Plan): Promise<{
  stripeProductId: string;
  stripePriceId: string;
}> {
  const stripe = getStripe();

  const product = await stripe.products.create({
    name: plan.displayName,
    description: plan.tagline ?? undefined,
    metadata: { planId: plan.id, planSlug: plan.slug },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.priceCents,
    currency: plan.currency,
    recurring: { interval: "month" },
    metadata: { planId: plan.id },
  });

  const ids: BillingIds = {
    stripeProductId: product.id,
    stripePriceId: price.id,
    archivedPriceIds: [],
  };
  await writeBillingIds(plan.id, ids);
  return { stripeProductId: product.id, stripePriceId: price.id };
}

/**
 * Stripe prices are immutable. Create a new Price, archive the old, and
 * push the old ID into `archivedPriceIds[]` so late-arriving webhooks can
 * still resolve to the plan.
 */
export async function rotateStripePrice(
  plan: Plan,
  newPriceCents: number,
): Promise<{ stripePriceId: string; archivedPriceIds: string[] }> {
  const ids = readBillingIds(plan);
  if (!ids.stripeProductId || !ids.stripePriceId) {
    throw new Error("Plan is not synced to Stripe; create artifacts first");
  }

  const stripe = getStripe();
  const newPrice = await stripe.prices.create({
    product: ids.stripeProductId,
    unit_amount: newPriceCents,
    currency: plan.currency,
    recurring: { interval: "month" },
    metadata: { planId: plan.id },
  });

  await stripe.prices.update(ids.stripePriceId, { active: false });

  const archived = [...(ids.archivedPriceIds ?? []), ids.stripePriceId];
  const next: BillingIds = {
    stripeProductId: ids.stripeProductId,
    stripePriceId: newPrice.id,
    archivedPriceIds: archived,
  };
  await writeBillingIds(plan.id, next);
  return { stripePriceId: newPrice.id, archivedPriceIds: archived };
}

/**
 * Archive the Stripe product + active price for a plan being deactivated.
 * Best-effort; logs and continues on per-call failure.
 */
export async function archiveStripeProduct(plan: Plan): Promise<void> {
  const ids = readBillingIds(plan);
  if (!ids.stripeProductId) return;

  const stripe = getStripe();
  if (ids.stripePriceId) {
    try {
      await stripe.prices.update(ids.stripePriceId, { active: false });
    } catch {
      // Price may already be archived
    }
  }
  try {
    await stripe.products.update(ids.stripeProductId, { active: false });
  } catch {
    // Product may already be archived
  }
}
