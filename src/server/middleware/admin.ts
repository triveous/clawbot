import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Simple admin auth middleware — checks for ADMIN_API_KEY in Bearer token.
 */
export function adminAuth() {
  return async (c: Context, next: Next) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      throw new HTTPException(503, {
        message: "Admin API not configured",
      });
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const token = authHeader.slice(7);
    if (token !== adminKey) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    await next();
  };
}
