import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { clerkAuth } from "./middleware/clerk";
import { adminAuth } from "./middleware/admin";
import { webhooksRoute } from "./routes/webhooks";
import { assistantsRoute } from "./routes/assistants";
import { channelsRoute } from "./routes/channels";
import { billingRoute } from "./routes/billing";
import { adminRoute } from "./routes/admin";

const app = new Hono().basePath("/api");

// Global middleware
app.use("*", logger());
app.use("*", cors());

// Public routes (no auth required)
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/webhooks", webhooksRoute);

// Protected routes — Clerk auth required
app.use("/assistants/*", clerkAuth());
app.use("/channels/*", clerkAuth());
app.use("/billing/*", clerkAuth());

// Admin routes — API key auth
app.use("/admin/*", adminAuth());

// Routes — chained for Hono RPC type inference
const appWithRoutes = app
  .route("/assistants", assistantsRoute)
  .route("/channels", channelsRoute)
  .route("/billing", billingRoute)
  .route("/admin", adminRoute);

export type AppType = typeof appWithRoutes;
export default appWithRoutes;
