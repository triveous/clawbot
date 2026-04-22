import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getStripe } from "./client";

/**
 * Mark a Stripe subscription to cancel at the end of the current period.
 * The actual cancellation event arrives via `customer.subscription.deleted`
 * webhook later.
 */
export async function cancelAtPeriodEnd(
  stripeSubscriptionId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

/**
 * Switch a subscription to a new price.
 * - upgrade   → immediate, prorated.
 * - downgrade → scheduled, takes effect at the next period boundary.
 *               Uses Stripe subscription schedules so the customer keeps
 *               their current plan until period end.
 */
export async function changeSubscriptionPlan(opts: {
  stripeSubscriptionId: string;
  newPriceId: string;
  mode: "upgrade" | "downgrade";
}): Promise<{ stripeScheduleId?: string }> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(opts.stripeSubscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error("Subscription has no items");

  if (opts.mode === "upgrade") {
    await stripe.subscriptions.update(opts.stripeSubscriptionId, {
      items: [{ id: item.id, price: opts.newPriceId, quantity: 1 }],
      proration_behavior: "create_prorations",
    });
    return {};
  }

  // downgrade — schedule the switch at period end
  let scheduleId = sub.schedule
    ? typeof sub.schedule === "string"
      ? sub.schedule
      : sub.schedule.id
    : null;

  if (!scheduleId) {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: opts.stripeSubscriptionId,
    });
    scheduleId = created.id;
  }

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhase = schedule.phases[schedule.phases.length - 1];

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    phases: [
      {
        items: currentPhase.items.map((it) => ({
          price:
            typeof it.price === "string"
              ? it.price
              : (it.price as unknown as { id: string }).id,
          quantity: it.quantity ?? 1,
        })),
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
      },
      {
        items: [{ price: opts.newPriceId, quantity: 1 }],
        duration: { interval: "month", interval_count: 1 },
      },
    ],
  });

  await db
    .update(subscriptions)
    .set({ stripeScheduleId: scheduleId })
    .where(eq(subscriptions.stripeSubscriptionId, opts.stripeSubscriptionId));

  return { stripeScheduleId: scheduleId };
}
