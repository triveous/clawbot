import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { verifyTailscaleAuthKey } from "@/lib/tailscale/verify";

export const tailscaleRoute = new Hono()

  // Verify a Tailscale auth key without storing it
  .post("/verify", async (c) => {
    const body = await c.req.json<{ authKey?: string }>();

    if (!body.authKey?.trim()) {
      throw new HTTPException(400, { message: "authKey is required" });
    }

    try {
      const info = await verifyTailscaleAuthKey(body.authKey);
      return c.json(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tailscale API error";
      throw new HTTPException(502, { message: msg });
    }
  });
