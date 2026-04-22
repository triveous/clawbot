import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/schema";
import { getStripe } from "./client";

/**
 * Find or create a Stripe customer for an organization.
 * Persists `billingCustomerId` on the org row on first creation.
 */
export async function ensureStripeCustomer(org: Organization): Promise<string> {
  if (org.billingCustomerId) return org.billingCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId: org.id },
  });

  await db
    .update(organizations)
    .set({ billingCustomerId: customer.id })
    .where(eq(organizations.id, org.id));

  return customer.id;
}
