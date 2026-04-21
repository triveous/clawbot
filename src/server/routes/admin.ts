import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { assistantCredits, plans, snapshots } from "@/lib/db/schema";
import type { CreditStatus, Provider } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/workflows/bootstrap";
import { deleteSnapshot } from "@/lib/workflows/snapshot-deletion";
import { invalidatePlanCache } from "@/lib/plans/catalog";
import { releaseCredit } from "@/lib/billing/credits";

const VALID_PROVIDERS: Provider[] = ["hetzner"];

export const adminRoute = new Hono()

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  .post("/providers/:provider/snapshots/build", async (c) => {
    const provider = c.req.param("provider") as Provider;

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const body = await c.req.json<{
      version?: string;
      openclawVersion?: string;
    }>();

    if (!body.version || !body.openclawVersion) {
      throw new HTTPException(400, {
        message: "version and openclawVersion are required",
      });
    }

    const run = await start(buildSnapshot, [body.version, body.openclawVersion]);
    return c.json({ runId: run.runId, message: "Snapshot build started" }, 202);
  })

  .get("/providers/:provider/snapshots", async (c) => {
    const provider = c.req.param("provider") as Provider;

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const providerSnapshots = await db.query.snapshots.findMany({
      where: eq(snapshots.provider, provider),
      orderBy: desc(snapshots.createdAt),
    });

    return c.json({ snapshots: providerSnapshots });
  })

  .delete("/providers/:provider/snapshots/:id", async (c) => {
    const provider = c.req.param("provider") as Provider;
    const snapshotId = c.req.param("id");

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const snapshot = await db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, snapshotId), eq(snapshots.provider, provider)),
    });

    if (!snapshot) {
      throw new HTTPException(404, { message: "Snapshot not found" });
    }

    const run = await start(deleteSnapshot, [snapshotId]);
    return c.json({ runId: run.runId, message: "Snapshot deletion started" }, 202);
  })

  // ─── Plans ──────────────────────────────────────────────────────────────────

  .get("/plans", async (c) => {
    const all = await db.query.plans.findMany({
      orderBy: (p, { asc }) => [asc(p.sortOrder)],
    });
    return c.json({ plans: all });
  })

  .post("/plans", async (c) => {
    const body = await c.req.json<{
      slug?: string;
      displayName?: string;
      tagline?: string;
      priceCents?: number;
      currency?: string;
      tier?: number;
      providerSpec?: Record<string, unknown>;
      billingProviderIds?: Record<string, string>;
      resourceLimits?: Record<string, number>;
      benefits?: string[];
      isActive?: boolean;
      sortOrder?: number;
    }>();

    if (!body.slug?.trim()) {
      throw new HTTPException(400, { message: "slug is required" });
    }
    if (!body.displayName?.trim()) {
      throw new HTTPException(400, { message: "displayName is required" });
    }
    if (body.priceCents === undefined || body.priceCents === null) {
      throw new HTTPException(400, { message: "priceCents is required" });
    }
    if (body.tier === undefined || body.tier === null) {
      throw new HTTPException(400, { message: "tier is required" });
    }
    if (!body.providerSpec || typeof body.providerSpec !== "object") {
      throw new HTTPException(400, { message: "providerSpec is required" });
    }

    const [plan] = await db
      .insert(plans)
      .values({
        slug: body.slug.trim(),
        displayName: body.displayName.trim(),
        tagline: body.tagline ?? null,
        priceCents: body.priceCents,
        currency: body.currency ?? "usd",
        tier: body.tier,
        providerSpec: body.providerSpec,
        billingProviderIds: body.billingProviderIds ?? {},
        resourceLimits: body.resourceLimits ?? {},
        benefits: body.benefits ?? [],
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    invalidatePlanCache();
    return c.json({ plan }, 201);
  })

  .patch("/plans/:id", async (c) => {
    const planId = c.req.param("id");
    const body = await c.req.json<{
      displayName?: string;
      tagline?: string;
      priceCents?: number;
      currency?: string;
      tier?: number;
      providerSpec?: Record<string, unknown>;
      billingProviderIds?: Record<string, string>;
      resourceLimits?: Record<string, number>;
      benefits?: string[];
      isActive?: boolean;
      sortOrder?: number;
    }>();

    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
    if (!existing) throw new HTTPException(404, { message: "Plan not found" });

    const [updated] = await db
      .update(plans)
      .set({
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
        ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.providerSpec !== undefined ? { providerSpec: body.providerSpec } : {}),
        ...(body.billingProviderIds !== undefined ? { billingProviderIds: body.billingProviderIds } : {}),
        ...(body.resourceLimits !== undefined ? { resourceLimits: body.resourceLimits } : {}),
        ...(body.benefits !== undefined ? { benefits: body.benefits } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      })
      .where(eq(plans.id, planId))
      .returning();

    invalidatePlanCache();
    return c.json({ plan: updated });
  })

  // Soft-flag isActive=false; never hard-delete (existing assistants may reference it)
  .delete("/plans/:id", async (c) => {
    const planId = c.req.param("id");

    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });
    if (!existing) throw new HTTPException(404, { message: "Plan not found" });

    const [updated] = await db
      .update(plans)
      .set({ isActive: false })
      .where(eq(plans.id, planId))
      .returning();

    invalidatePlanCache();
    return c.json({ plan: updated });
  })

  // ─── Credits ────────────────────────────────────────────────────────────────

  .get("/credits", async (c) => {
    const orgId = c.req.query("orgId");
    const where = orgId
      ? eq(assistantCredits.orgId, orgId)
      : undefined;

    const credits = await db.query.assistantCredits.findMany({
      where,
      orderBy: desc(assistantCredits.createdAt),
    });

    return c.json({ credits });
  })

  .post("/credits/mint", async (c) => {
    const body = await c.req.json<{
      orgId?: string;
      planId?: string;
      durationDays?: number;
      source?: string;
    }>();

    if (!body.orgId?.trim()) {
      throw new HTTPException(400, { message: "orgId is required" });
    }
    if (!body.planId?.trim()) {
      throw new HTTPException(400, { message: "planId is required" });
    }

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, body.planId),
    });
    if (!plan) throw new HTTPException(404, { message: "Plan not found" });

    const durationDays = body.durationDays ?? 30;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const [credit] = await db
      .insert(assistantCredits)
      .values({
        orgId: body.orgId.trim(),
        planId: body.planId.trim(),
        status: "active" as CreditStatus,
        source: body.source ?? "admin_mint",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return c.json({ credit }, 201);
  })

  .post("/credits/:id/revoke", async (c) => {
    const creditId = c.req.param("id");

    const credit = await db.query.assistantCredits.findFirst({
      where: eq(assistantCredits.id, creditId),
    });
    if (!credit) throw new HTTPException(404, { message: "Credit not found" });

    await db.transaction(async (tx) => {
      await tx
        .update(assistantCredits)
        .set({ status: "canceled" as CreditStatus })
        .where(eq(assistantCredits.id, creditId));

      if (credit.consumedByAssistantId) {
        await releaseCredit(
          credit.consumedByAssistantId,
          tx as Parameters<typeof releaseCredit>[1],
        );
      }
    });

    return c.json({ revoked: true });
  });
