import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { orgAdmin } from "@/server/middleware/org-admin";

export const organizationsRoute = new Hono()

  // Current org details
  .get("/current", async (c) => {
    const dbOrg = c.get("dbOrg");
    return c.json({ org: dbOrg });
  })

  // Update org name/slug (org admin only)
  .patch("/current", orgAdmin(), async (c) => {
    const dbOrg = c.get("dbOrg");
    const body = await c.req.json<{ name?: string; slug?: string }>();

    if (!body.name && !body.slug) {
      throw new HTTPException(400, {
        message: "At least one of name or slug is required",
      });
    }

    const [updated] = await db
      .update(organizations)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.slug ? { slug: body.slug } : {}),
      })
      .where(eq(organizations.id, dbOrg.id))
      .returning();

    return c.json({ org: updated });
  });
