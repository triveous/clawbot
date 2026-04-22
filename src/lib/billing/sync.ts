import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  assistantCredits,
  invoices,
  subscriptions,
} from "@/lib/db/schema";
import type {
  AssistantCredit,
  CreditStatus,
  Invoice,
  Subscription,
  SubscriptionStatus,
} from "@/lib/db/schema";
import { getPlanByStripePriceId } from "@/lib/plans/catalog";
import { releaseCredit } from "@/lib/billing/credits";

// ─── Status mappers ─────────────────────────────────────────────────────────

const SUB_STATUS_MAP: Record<string, SubscriptionStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  paused: "past_due",
};

export function mapStripeSubscriptionStatus(
  stripeStatus: string,
): SubscriptionStatus {
  return SUB_STATUS_MAP[stripeStatus] ?? "incomplete";
}

const CREDIT_STATUS_MAP: Record<SubscriptionStatus, CreditStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "expired",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "canceled",
};

export function subStatusToCreditStatus(
  status: SubscriptionStatus,
): CreditStatus {
  return CREDIT_STATUS_MAP[status];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(secs: number | null | undefined): Date | null {
  return typeof secs === "number" ? new Date(secs * 1000) : null;
}

function readMetaOrgId(
  metadata: Stripe.Metadata | null | undefined,
  fallback?: string,
): string {
  const fromMeta = metadata?.orgId;
  const value = fromMeta ?? fallback;
  if (!value) throw new Error("Cannot resolve orgId for Stripe object");
  return value;
}

function getScheduleId(
  schedule: Stripe.Subscription["schedule"],
): string | null {
  if (!schedule) return null;
  return typeof schedule === "string" ? schedule : schedule.id;
}

function readSubscriptionPeriod(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = sub.items.data[0];
  const start = toDate(item?.current_period_start ?? null);
  const end = toDate(item?.current_period_end ?? null);
  return { start, end };
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  orgIdHint?: string,
  planIdHint?: string,
): Promise<Subscription> {
  const orgId = readMetaOrgId(sub.metadata, orgIdHint);

  const priceId = sub.items.data[0]?.price.id;
  let planId = sub.metadata?.planId ?? planIdHint;
  if (priceId) {
    const plan = await getPlanByStripePriceId(priceId);
    if (plan) planId = plan.id;
  }
  if (!planId) {
    throw new Error(
      `Cannot resolve planId for subscription ${sub.id} (priceId=${priceId})`,
    );
  }

  const status = mapStripeSubscriptionStatus(sub.status);
  const period = readSubscriptionPeriod(sub);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, sub.id),
  });

  if (existing) {
    const [updated] = await db
      .update(subscriptions)
      .set({
        orgId,
        planId,
        stripeCustomerId: customerId,
        stripeScheduleId: getScheduleId(sub.schedule),
        status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: toDate(sub.canceled_at),
      })
      .where(eq(subscriptions.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      orgId,
      planId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      stripeScheduleId: getScheduleId(sub.schedule),
      status,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: toDate(sub.canceled_at),
    })
    .returning();
  return created;
}

// ─── Credits ─────────────────────────────────────────────────────────────────

export async function linkCreditToSubscription(
  sub: Subscription,
): Promise<AssistantCredit> {
  const creditStatus = subStatusToCreditStatus(sub.status);

  const existing = await db.query.assistantCredits.findFirst({
    where: eq(assistantCredits.externalSubscriptionId, sub.stripeSubscriptionId),
  });

  if (existing) {
    const [updated] = await db
      .update(assistantCredits)
      .set({
        orgId: sub.orgId,
        planId: sub.planId,
        subscriptionId: sub.id,
        status: creditStatus,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
      })
      .where(eq(assistantCredits.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(assistantCredits)
    .values({
      orgId: sub.orgId,
      planId: sub.planId,
      subscriptionId: sub.id,
      status: creditStatus,
      source: "stripe",
      externalSubscriptionId: sub.stripeSubscriptionId,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    })
    .returning();
  return created;
}

export async function markCreditCanceled(
  stripeSubscriptionId: string,
): Promise<void> {
  const credit = await db.query.assistantCredits.findFirst({
    where: eq(
      assistantCredits.externalSubscriptionId,
      stripeSubscriptionId,
    ),
  });
  if (!credit) return;

  await db.transaction(async (tx) => {
    await tx
      .update(assistantCredits)
      .set({ status: "canceled" })
      .where(eq(assistantCredits.id, credit.id));

    if (credit.consumedByAssistantId) {
      await releaseCredit(
        credit.consumedByAssistantId,
        tx as Parameters<typeof releaseCredit>[1],
      );
    }
  });
}

// ─── Invoices ────────────────────────────────────────────────────────────────

const INVOICE_STATUS_MAP: Record<string, Invoice["status"]> = {
  draft: "draft",
  open: "open",
  paid: "paid",
  uncollectible: "uncollectible",
  void: "void",
};

export async function upsertInvoiceFromStripe(
  invoice: Stripe.Invoice,
  orgIdHint?: string,
): Promise<Invoice | null> {
  if (!invoice.id) return null;

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return null;

  // Resolve subscription link
  const stripeSubId = (
    invoice as unknown as { subscription?: string | { id: string } | null }
  ).subscription;
  const stripeSubscriptionId =
    typeof stripeSubId === "string"
      ? stripeSubId
      : stripeSubId?.id ?? null;

  let subscriptionId: string | null = null;
  let orgId: string | null = orgIdHint ?? invoice.metadata?.orgId ?? null;

  if (stripeSubscriptionId) {
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
    });
    if (sub) {
      subscriptionId = sub.id;
      orgId = sub.orgId;
    }
  }

  if (!orgId) {
    // No org context — skip mirroring (admin/standalone invoices not supported)
    return null;
  }

  const status =
    INVOICE_STATUS_MAP[invoice.status ?? "draft"] ?? "draft";
  const periodStart =
    invoice.lines.data[0]?.period?.start ?? invoice.period_start ?? null;
  const periodEnd =
    invoice.lines.data[0]?.period?.end ?? invoice.period_end ?? null;

  const existing = await db.query.invoices.findFirst({
    where: eq(invoices.stripeInvoiceId, invoice.id),
  });

  const values = {
    orgId,
    subscriptionId,
    stripeInvoiceId: invoice.id,
    stripeCustomerId: customerId,
    number: invoice.number ?? null,
    status,
    amountDue: invoice.amount_due ?? 0,
    amountPaid: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "usd",
    periodStart: toDate(periodStart),
    periodEnd: toDate(periodEnd),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
    issuedAt: toDate(invoice.created),
    paidAt:
      status === "paid"
        ? toDate(
            (invoice as unknown as { status_transitions?: { paid_at?: number } })
              .status_transitions?.paid_at ?? invoice.created,
          )
        : null,
  };

  if (existing) {
    const [updated] = await db
      .update(invoices)
      .set(values)
      .where(eq(invoices.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(invoices)
    .values(values)
    .returning();
  return created;
}
