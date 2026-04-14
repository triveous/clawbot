import { Hono } from "hono";

export const channelsRoute = new Hono();

// Phase 3: Channel setup endpoints
// POST /:agentId/setup — push channel config to VPS
// GET /:agentId/health — check channel health

channelsRoute.get("/", (c) => {
  return c.json({ channels: [], message: "Phase 3: Not implemented yet" });
});
