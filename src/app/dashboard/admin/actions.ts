"use server";

import { desc, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { snapshots, plans, assistantCredits } from "@/lib/db/schema";
import type { CreditStatus } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/workflows/bootstrap";
import { deleteSnapshot } from "@/lib/workflows/snapshot-deletion";
import { invalidatePlanCache } from "@/lib/plans/catalog";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function getSnapshots() {
  await requirePlatformAdmin();
  return db.query.snapshots.findMany({
    orderBy: desc(snapshots.createdAt),
  });
}

export async function triggerSnapshotBuild(version: string, openclawVersion: string) {
  await requirePlatformAdmin();
  const run = await start(buildSnapshot, [version, openclawVersion]);
  return { runId: run.runId };
}

export async function triggerSnapshotDelete(snapshotId: string) {
  await requirePlatformAdmin();
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
  return plan;
}

export async function togglePlanActive(planId: string, isActive: boolean) {
  await requirePlatformAdmin();
  await db.update(plans).set({ isActive }).where(eq(plans.id, planId));
  invalidatePlanCache();
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
