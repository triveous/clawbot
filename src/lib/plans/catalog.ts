import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import type { Plan } from "@/lib/db/schema";

const CACHE_TTL_MS = 60_000;
let cache: { plans: Plan[]; fetchedAt: number } | null = null;

async function loadPlans(activeOnly: boolean): Promise<Plan[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    const result = cache.plans;
    return activeOnly ? result.filter((p) => p.isActive) : result;
  }

  const all = await db.query.plans.findMany({
    orderBy: (p, { asc }) => [asc(p.sortOrder)],
  });

  cache = { plans: all, fetchedAt: now };
  return activeOnly ? all.filter((p) => p.isActive) : all;
}

export async function listPlans(opts: { activeOnly?: boolean } = {}): Promise<Plan[]> {
  return loadPlans(opts.activeOnly ?? true);
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const cached = cache?.plans.find((p) => p.id === planId);
  if (cached) return cached;

  return (
    (await db.query.plans.findFirst({ where: eq(plans.id, planId) })) ?? null
  );
}

export function invalidatePlanCache(): void {
  cache = null;
}

/**
 * Look up a plan by its current Stripe price ID, falling back to historical
 * (archived) price IDs so webhook events for past prices still resolve
 * correctly after a price rotation.
 */
export async function getPlanByStripePriceId(
  priceId: string,
): Promise<Plan | null> {
  const cached = cache?.plans.find((p) => {
    const ids = p.billingProviderIds as Record<string, unknown>;
    if (ids?.stripePriceId === priceId) return true;
    const archived = ids?.archivedPriceIds;
    return Array.isArray(archived) && archived.includes(priceId);
  });
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(plans)
    .where(
      sql`(${plans.billingProviderIds} ->> 'stripePriceId') = ${priceId}
          OR (${plans.billingProviderIds} -> 'archivedPriceIds') ? ${priceId}`,
    )
    .limit(1);
  return row ?? null;
}

export function getHetznerServerType(plan: Plan): string {
  const spec = plan.providerSpec as Record<string, unknown>;
  const hetzner = spec?.hetzner as Record<string, unknown> | undefined;
  const serverType = hetzner?.serverType;
  if (typeof serverType !== "string") {
    throw new Error(
      `Plan "${plan.slug}" has no hetzner.serverType in providerSpec`,
    );
  }
  return serverType;
}
