import { Hono } from "hono";
import { stripeWebhookRoute } from "./webhooks/stripe";

export const webhooksRoute = new Hono().route("/stripe", stripeWebhookRoute);
