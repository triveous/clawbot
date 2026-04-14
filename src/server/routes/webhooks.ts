import { Hono } from "hono";

export const webhooksRoute = new Hono();

// Phase 4: Stripe webhook handler will be registered here
// webhooksRoute.post("/stripe", stripeWebhookHandler);
