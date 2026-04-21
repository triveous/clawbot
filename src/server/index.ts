import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "./middleware/logger";
import { clerkAuth } from "./middleware/clerk";
import { adminAuth } from "./middleware/admin";
import { getLogger } from "@/lib/logger";
import { webhooksRoute } from "./routes/webhooks";
import { assistantsRoute } from "./routes/assistants";
import { channelsRoute } from "./routes/channels";
import { billingRoute } from "./routes/billing";
import { adminRoute } from "./routes/admin";
import { organizationsRoute } from "./routes/organizations";
import { plansRoute } from "./routes/plans";
import { creditsRoute } from "./routes/credits";
import { tailscaleRoute } from "./routes/tailscale";

const app = new Hono().basePath("/api");

// Global middleware
app.use("*", requestLogger());
app.use("*", cors());

// Global error handler
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

// Public routes
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/webhooks", webhooksRoute);

// Protected routes — Clerk auth required
app.use("/assistants/*", clerkAuth());
app.use("/channels/*", clerkAuth());
app.use("/billing/*", clerkAuth());
app.use("/orgs/*", clerkAuth());
app.use("/credits/*", clerkAuth());
app.use("/tailscale/*", clerkAuth());

// Plans — Clerk auth required (plans are global, any authenticated user can read)
app.use("/plans/*", clerkAuth());

// Admin routes — API key auth
app.use("/admin/*", adminAuth());

// Routes — chained for Hono RPC type inference
const appWithRoutes = app
  .route("/assistants", assistantsRoute)
  .route("/channels", channelsRoute)
  .route("/billing", billingRoute)
  .route("/admin", adminRoute)
  .route("/orgs", organizationsRoute)
  .route("/plans", plansRoute)
  .route("/credits", creditsRoute)
  .route("/tailscale", tailscaleRoute);

export type AppType = typeof appWithRoutes;
export default appWithRoutes;
