import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, plans, subscriptions } from "@/lib/db/schema";
import { getPlan } from "@/lib/plans/catalog";
import {
  createCheckoutSession,
  createPortalSession,
} from "@/lib/stripe/checkout";
import {
  cancelAtPeriodEnd,
  changeSubscriptionPlan,
} from "@/lib/stripe/subscriptions";
import { getStripe } from "@/lib/stripe/client";

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const billingRoute = new Hono()

  // ─── Checkout / Portal ────────────────────────────────────────────────────

  .post("/checkout", async (c) => {
    const dbOrg = c.get("dbOrg");
    const body = await c.req.json<{ planId?: string }>();
    if (!body.planId) {
      throw new HTTPException(400, { message: "planId is required" });
    }

    const plan = await getPlan(body.planId);
    if (!plan) throw new HTTPException(404, { message: "Plan not found" });

    const base = appBaseUrl();
    try {
      const result = await createCheckoutSession({
        org: dbOrg,
        planId: body.planId,
        successUrl: `${base}/dashboard/${dbOrg.id}/billing?checkout=success`,
        cancelUrl: `${base}/dashboard/${dbOrg.id}/pricing?checkout=cancel`,
      });
      return c.json(result);
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Checkout failed",
      });
    }
  })

  .post("/portal", async (c) => {
    const dbOrg = c.get("dbOrg");
    const base = appBaseUrl();
    const result = await createPortalSession({
      org: dbOrg,
      returnUrl: `${base}/dashboard/${dbOrg.id}/billing`,
    });
    return c.json(result);
  })

  // ─── Read endpoints ───────────────────────────────────────────────────────

  .get("/subscriptions", async (c) => {
    const dbOrg = c.get("dbOrg");

    const rows = await db
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        planSlug: plans.slug,
        planDisplayName: plans.displayName,
        priceCents: plans.priceCents,
        currency: plans.currency,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        stripeScheduleId: subscriptions.stripeScheduleId,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        canceledAt: subscriptions.canceledAt,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.orgId, dbOrg.id))
      .orderBy(desc(subscriptions.createdAt));

    return c.json({ subscriptions: rows });
  })

  // ─── Stripe cards (org-admin only) ────────────────────────────────────────
  // Returns the card-type payment methods attached to this org's Stripe
  // customer, plus which one is the default. No sensitive fields — just
  // brand, last4, and expiry — so the UI can render the "Payment methods"
  // card without giving the user the ability to mutate anything from here
  // (the Stripe portal still owns add / remove / set-default).
  .get("/payment-methods", async (c) => {
    const { orgRole } = await auth();
    if (orgRole !== "org:admin") {
      throw new HTTPException(403, { message: "Org admin role required" });
    }

    const dbOrg = c.get("dbOrg");
    if (!dbOrg.billingCustomerId) {
      return c.json({ paymentMethods: [], defaultId: null });
    }

    const stripe = getStripe();
    const [methods, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: dbOrg.billingCustomerId,
        type: "card",
        limit: 20,
      }),
      stripe.customers.retrieve(dbOrg.billingCustomerId),
    ]);

    const defaultId =
      !customer.deleted && typeof customer !== "string"
        ? ((customer.invoice_settings?.default_payment_method as string | null) ??
          null)
        : null;

    return c.json({
      defaultId,
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "",
        last4: pm.card?.last4 ?? "",
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        funding: pm.card?.funding ?? "",
        country: pm.card?.country ?? "",
        isDefault: pm.id === defaultId,
      })),
    });
  })

  .get("/invoices", async (c) => {
    const dbOrg = c.get("dbOrg");
    const rows = await db.query.invoices.findMany({
      where: eq(invoices.orgId, dbOrg.id),
      orderBy: (t, { desc: d }) => [d(t.issuedAt)],
      limit: 50,
    });
    return c.json({ invoices: rows });
  })

  // ─── Mutations ────────────────────────────────────────────────────────────

  .post("/subscriptions/:id/cancel", async (c) => {
    const dbOrg = c.get("dbOrg");
    const subId = c.req.param("id");

    const sub = await db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, subId), eq(subscriptions.orgId, dbOrg.id)),
    });
    if (!sub) throw new HTTPException(404, { message: "Subscription not found" });

    await cancelAtPeriodEnd(sub.stripeSubscriptionId);
    return c.json({ canceled: true, cancelAtPeriodEnd: true });
  })

  .post("/subscriptions/:id/change-plan", async (c) => {
    const dbOrg = c.get("dbOrg");
    const subId = c.req.param("id");
    const body = await c.req.json<{
      newPlanId?: string;
      mode?: "upgrade" | "downgrade";
    }>();

    if (!body.newPlanId) {
      throw new HTTPException(400, { message: "newPlanId is required" });
    }
    if (body.mode !== "upgrade" && body.mode !== "downgrade") {
      throw new HTTPException(400, {
        message: "mode must be 'upgrade' or 'downgrade'",
      });
    }

    const sub = await db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, subId), eq(subscriptions.orgId, dbOrg.id)),
    });
    if (!sub) throw new HTTPException(404, { message: "Subscription not found" });

    const newPlan = await getPlan(body.newPlanId);
    if (!newPlan) throw new HTTPException(404, { message: "Plan not found" });

    const newPriceId = (
      newPlan.billingProviderIds as Record<string, unknown>
    )?.stripePriceId;
    if (typeof newPriceId !== "string") {
      throw new HTTPException(400, {
        message: "Target plan has no Stripe price configured",
      });
    }

    const result = await changeSubscriptionPlan({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      newPriceId,
      mode: body.mode,
    });

    return c.json({ ok: true, ...result });
  });
