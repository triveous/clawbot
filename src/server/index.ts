import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { clerkAuth } from "./middleware/clerk";
import { webhooksRoute } from "./routes/webhooks";
import { agentsRoute } from "./routes/agents";
import { channelsRoute } from "./routes/channels";
import { billingRoute } from "./routes/billing";

const app = new Hono().basePath("/api");

// Global middleware
app.use("*", logger());
app.use("*", cors());

// Public routes (no auth required)
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/webhooks", webhooksRoute);

// Protected routes — Clerk auth required
app.use("/agents/*", clerkAuth());
app.use("/channels/*", clerkAuth());
app.use("/billing/*", clerkAuth());

// Routes — chained for Hono RPC type inference
const appWithRoutes = app
  .route("/agents", agentsRoute)
  .route("/channels", channelsRoute)
  .route("/billing", billingRoute);

export type AppType = typeof appWithRoutes;
export default appWithRoutes;
