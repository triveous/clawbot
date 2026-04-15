import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "./middleware/logger";
import { clerkAuth } from "./middleware/clerk";
import { getLogger } from "@/lib/logger";
import { webhooksRoute } from "./routes/webhooks";
import { agentsRoute } from "./routes/agents";
import { channelsRoute } from "./routes/channels";
import { billingRoute } from "./routes/billing";

const app = new Hono().basePath("/api");

// Global middleware
app.use("*", requestLogger());
app.use("*", cors());

// Global error handler — logs all errors with request context
app.onError((err, c) => {
  const log = c.get("logger") ?? getLogger("server");
  const status = err instanceof HTTPException ? err.status : 500;

  if (status >= 500) {
    log.error("Unhandled server error", {
      error: err.message,
      stack: err.stack,
      status,
    });
  } else {
    log.warn("Client error", {
      error: err.message,
      status,
    });
  }

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  return c.json({ error: "Internal Server Error" }, 500);
});

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
