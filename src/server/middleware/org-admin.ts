import { auth } from "@clerk/nextjs/server";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Requires the authenticated user to be an org:admin in the active org.
 * Must be used after clerkAuth().
 */
export function orgAdmin() {
  return async (c: Context, next: Next) => {
    const { orgRole } = await auth();
    if (orgRole !== "org:admin") {
      throw new HTTPException(403, {
        message: "Org admin role required",
      });
    }
    await next();
  };
}
