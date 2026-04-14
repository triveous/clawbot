import { Hono } from "hono";

export const billingRoute = new Hono();

// Phase 4: Billing endpoints
// POST /checkout — create Stripe Checkout session
// GET /subscriptions — list user subscriptions
// GET /usage — query OpenRouter usage

billingRoute.get("/", (c) => {
  return c.json({ message: "Phase 4: Not implemented yet" });
});
