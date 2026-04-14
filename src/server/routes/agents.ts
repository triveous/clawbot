import { Hono } from "hono";

export const agentsRoute = new Hono();

// Phase 2: Provisioning endpoints
// POST /  — create agent (async provisioning)
// GET /:id — get agent details
// POST /:id/restart — restart agent
// POST /:id/stop — stop agent
// DELETE /:id — destroy agent

agentsRoute.get("/", (c) => {
  return c.json({ agents: [], message: "Phase 2: Not implemented yet" });
});
