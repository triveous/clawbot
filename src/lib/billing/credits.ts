import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantCredits, plans } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type { CreditStatus } from "@/lib/db/schema";

type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type DbOrTx = typeof db | Tx;

/**
 * Check if an org has a free, active credit at or above the requested plan tier.
 */
export async function canProvision(
  orgId: string,
  planId: string,
): Promise<boolean> {
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });
  if (!plan) return false;

  const [row] = await db
    .select({ creditPlanTier: plans.tier })
    .from(assistantCredits)
    .innerJoin(plans, eq(assistantCredits.planId, plans.id))
    .where(
      and(
        eq(assistantCredits.orgId, orgId),
        eq(assistantCredits.status, "active" as CreditStatus),
        isNull(assistantCredits.consumedByAssistantId),
        gt(assistantCredits.currentPeriodEnd, new Date()),
      ),
    )
    .limit(1);

  if (!row) return false;
  return row.creditPlanTier >= plan.tier;
}

/**
 * Atomically reserve a credit for the given org + plan combination.
 * Returns the credit id if successful.
 * Throws an error with status 409 if no credit is available.
 */
export async function consumeCredit(
  orgId: string,
  planId: string,
  assistantId: string,
  tx: DbOrTx = db,
): Promise<string> {
  const plan = await (tx as typeof db).query.plans.findFirst({
    where: eq(plans.id, planId),
  });
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const [updated] = await tx
    .update(assistantCredits)
    .set({ consumedByAssistantId: assistantId })
    .where(
      and(
        eq(assistantCredits.orgId, orgId),
        eq(assistantCredits.status, "active" as CreditStatus),
        isNull(assistantCredits.consumedByAssistantId),
        gt(assistantCredits.currentPeriodEnd, new Date()),
        sql`(SELECT tier FROM plans WHERE id = ${assistantCredits.planId}) >= ${plan.tier}`,
      ),
    )
    .returning({ id: assistantCredits.id });

  if (!updated) {
    const error = new Error(
      "No available credit for this plan tier",
    ) as Error & { status: number };
    error.status = 409;
    throw error;
  }
  return updated.id;
}

/**
 * Release the credit consumed by the given assistant (on delete or retry).
 */
export async function releaseCredit(
  assistantId: string,
  tx: DbOrTx = db,
): Promise<void> {
  await tx
    .update(assistantCredits)
    .set({ consumedByAssistantId: null })
    .where(eq(assistantCredits.consumedByAssistantId, assistantId));
}
