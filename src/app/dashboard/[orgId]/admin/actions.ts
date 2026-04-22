"use server";

import { desc, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { snapshots, plans, assistantCredits } from "@/lib/db/schema";
import type { CreditStatus } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/workflows/bootstrap";
import { deleteSnapshot } from "@/lib/workflows/snapshot-deletion";
import { invalidatePlanCache } from "@/lib/plans/catalog";
import {
  archiveStripeProduct,
  createStripePlanArtifacts,
  rotateStripePrice,
} from "@/lib/stripe/plans";
import { getLogger } from "@/lib/logger";

const adminLog = getLogger("admin-actions");

async function requirePlatformAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if ((user.publicMetadata as { role?: string })?.role !== "admin") {
    throw new Error("Forbidden — platform admin required");
  }
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function getSnapshots() {
  return db.query.snapshots.findMany({
    orderBy: desc(snapshots.createdAt),
  });
}

export async function triggerSnapshotBuild(version: string, openclawVersion: string) {
  const run = await start(buildSnapshot, [version, openclawVersion]);
  return { runId: run.runId };
}

export async function triggerSnapshotDelete(snapshotId: string) {
  const run = await start(deleteSnapshot, [snapshotId]);
  return { runId: run.runId };
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function getPlans() {
  await requirePlatformAdmin();
  return db.query.plans.findMany({
    orderBy: (p, { asc }) => [asc(p.sortOrder)],
  });
}

export async function createPlan(data: {
  slug: string;
  displayName: string;
  tagline?: string;
  priceCents: number;
  tier: number;
  providerSpec: string;
  benefits: string;
  sortOrder?: number;
  syncToStripe?: boolean;
}) {
  await requirePlatformAdmin();
  const providerSpec = JSON.parse(data.providerSpec) as Record<string, unknown>;
  const benefits = data.benefits
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const [plan] = await db
    .insert(plans)
    .values({
      slug: data.slug.trim(),
      displayName: data.displayName.trim(),
      tagline: data.tagline?.trim() || null,
      priceCents: data.priceCents,
      tier: data.tier,
      providerSpec,
      billingProviderIds: {},
      resourceLimits: {},
      benefits,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();

  invalidatePlanCache();

  if (data.syncToStripe) {
    try {
      await createStripePlanArtifacts(plan);
    } catch (err) {
      adminLog.error("Stripe plan sync failed", {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        `Plan saved, but Stripe sync failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return plan;
}

export async function togglePlanActive(planId: string, isActive: boolean) {
  await requirePlatformAdmin();
  const existing = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });
  if (!existing) throw new Error("Plan not found");

  await db.update(plans).set({ isActive }).where(eq(plans.id, planId));
  invalidatePlanCache();

  if (!isActive) {
    try {
      await archiveStripeProduct(existing);
    } catch (err) {
      adminLog.warn("Stripe archive failed (non-fatal)", {
        planId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function updatePlan(
  planId: string,
  data: {
    slug: string;
    displayName: string;
    tagline?: string;
    priceCents: number;
    tier: number;
    providerSpec: string;
    benefits: string;
    sortOrder?: number;
  },
) {
  await requirePlatformAdmin();
  const existing = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });
  if (!existing) throw new Error("Plan not found");

  const providerSpec = JSON.parse(data.providerSpec) as Record<string, unknown>;
  const benefits = data.benefits
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  await db
    .update(plans)
    .set({
      slug: data.slug.trim(),
      displayName: data.displayName.trim(),
      tagline: data.tagline?.trim() || null,
      priceCents: data.priceCents,
      tier: data.tier,
      providerSpec,
      benefits,
      sortOrder: data.sortOrder ?? 0,
    })
    .where(eq(plans.id, planId));

  invalidatePlanCache();

  // Rotate the Stripe price if (a) plan is already synced and (b) price changed.
  const ids = (existing.billingProviderIds ?? {}) as Record<string, unknown>;
  const hasStripe =
    typeof ids.stripeProductId === "string" &&
    typeof ids.stripePriceId === "string";

  if (hasStripe && data.priceCents !== existing.priceCents) {
    try {
      await rotateStripePrice(
        { ...existing, priceCents: data.priceCents },
        data.priceCents,
      );
    } catch (err) {
      adminLog.error("Stripe price rotation failed", {
        planId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        `Plan updated, but Stripe price rotation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export async function getCreditsForOrg(orgId: string) {
  await requirePlatformAdmin();
  return db.query.assistantCredits.findMany({
    where: eq(assistantCredits.orgId, orgId),
    orderBy: desc(assistantCredits.createdAt),
  });
}

export async function mintCredit(data: {
  orgId: string;
  planId: string;
  durationDays: number;
}) {
  await requirePlatformAdmin();
  const now = new Date();
  const periodEnd = new Date(now.getTime() + data.durationDays * 24 * 60 * 60 * 1000);
  const [credit] = await db
    .insert(assistantCredits)
    .values({
      orgId: data.orgId.trim(),
      planId: data.planId,
      status: "active" as CreditStatus,
      source: "admin_mint",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .returning();
  return credit;
}

export async function revokeCredit(creditId: string) {
  await requirePlatformAdmin();
  await db
    .update(assistantCredits)
    .set({ status: "canceled" as CreditStatus, consumedByAssistantId: null })
    .where(eq(assistantCredits.id, creditId));
}
