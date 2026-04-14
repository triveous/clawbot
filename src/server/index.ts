import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { webhooksRoute } from "./routes/webhooks";
import { agentsRoute } from "./routes/agents";
import { channelsRoute } from "./routes/channels";
import { billingRoute } from "./routes/billing";

const app = new Hono().basePath("/api");

// Global middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Routes
const routes = app
  .route("/webhooks", webhooksRoute)
  .route("/agents", agentsRoute)
  .route("/channels", channelsRoute)
  .route("/billing", billingRoute);

export type AppType = typeof routes;
export default app;
