import type Stripe from "stripe";
import { getStripe } from "./client";
import {
  linkCreditToSubscription,
  markCreditCanceled,
  upsertInvoiceFromStripe,
  upsertSubscriptionFromStripe,
} from "@/lib/billing/sync";
import { getLogger } from "@/lib/logger";

const log = getLogger("stripe-webhook");

// Bounded LRU of processed event IDs to swallow Stripe retries within a
// single process lifetime. DB unique constraints are the durable safety net.
const PROCESSED_CAP = 500;
const processedEventIds = new Set<string>();

function rememberEvent(id: string): boolean {
  if (processedEventIds.has(id)) return false;
  if (processedEventIds.size >= PROCESSED_CAP) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  processedEventIds.add(id);
  return true;
}

async function fetchSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!rememberEvent(event.id)) {
    log.info("Skipping duplicate Stripe event", { eventId: event.id });
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subId) return;

      const sub = await fetchSubscription(subId);
      const stored = await upsertSubscriptionFromStripe(
        sub,
        session.metadata?.orgId,
        session.metadata?.planId,
      );
      await linkCreditToSubscription(stored);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const stored = await upsertSubscriptionFromStripe(sub);
      await linkCreditToSubscription(stored);
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripe(sub).catch(() => null);
      await markCreditCanceled(sub.id);
      return;
    }

    case "invoice.created":
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await upsertInvoiceFromStripe(invoice);

      const subId = (
        invoice as unknown as { subscription?: string | { id: string } | null }
      ).subscription;
      const stripeSubId =
        typeof subId === "string" ? subId : subId?.id ?? null;

      if (stripeSubId) {
        const sub = await fetchSubscription(stripeSubId);
        const stored = await upsertSubscriptionFromStripe(sub);
        await linkCreditToSubscription(stored);
      }
      return;
    }

    default:
      log.debug("Ignoring Stripe event", { type: event.type });
  }
}
