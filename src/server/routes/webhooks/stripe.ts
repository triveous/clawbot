import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getStripe } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/stripe/webhook";
import { getLogger } from "@/lib/logger";

const log = getLogger("stripe-webhook-route");

export const stripeWebhookRoute = new Hono().post("/", async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new HTTPException(503, { message: "Stripe webhook not configured" });
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    throw new HTTPException(400, { message: "Missing stripe-signature" });
  }

  const body = await c.req.text();
  const stripe = getStripe();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (err) {
    log.warn("Stripe signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HTTPException(400, { message: "Invalid signature" });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    log.error("Stripe webhook handler threw", {
      eventId: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    // Re-throw so Stripe retries
    throw new HTTPException(500, { message: "Webhook processing failed" });
  }

  return c.json({ received: true });
});
