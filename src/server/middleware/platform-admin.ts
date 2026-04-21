import { auth, clerkClient } from "@clerk/nextjs/server";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Requires the authenticated user to have publicMetadata.role === "admin".
 * This is a platform-wide privilege (mint credits, edit plans), independent
 * of any org membership.
 *
 * Set via Clerk dashboard: User → publicMetadata → { "role": "admin" }.
 * Configure the Clerk session token to expose publicMetadata under "metadata"
 * so session claims include it (avoids an extra API call per request).
 */
export function platformAdmin() {
  return async (c: Context, next: Next) => {
    const { userId, sessionClaims } = await auth();
    if (!userId) throw new HTTPException(401, { message: "Unauthorized" });

    // Prefer session claim (zero latency) if Clerk session token is configured
    // to embed publicMetadata. Fall back to API call if the claim isn't present.
    const claimMeta = (sessionClaims as Record<string, unknown>)?.metadata as
      | Record<string, unknown>
      | undefined;
    if (claimMeta?.role === "admin") {
      return next();
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if ((user.publicMetadata as Record<string, unknown>)?.role !== "admin") {
      throw new HTTPException(403, { message: "Platform admin required" });
    }

    await next();
  };
}
