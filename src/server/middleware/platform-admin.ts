import { auth } from "@clerk/nextjs/server";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * Hono middleware gating a route on platform-admin role
 * (`publicMetadata.role === "admin"` in Clerk). Shares its role check with
 * the React server helpers in `@/lib/auth/platform-admin`.
 */
export function platformAdmin() {
  return async (c: Context, next: Next) => {
    const { userId } = await auth();
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });
    if (!(await isPlatformAdmin())) {
      throw new HTTPException(403, { message: "Platform admin required" });
    }
    await next();
  };
}
