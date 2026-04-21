import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { listPlans } from "@/lib/plans/catalog";

export const plansRoute = new Hono()

  // List active plans (public, cached)
  .get("/", async (c) => {
    const all = await listPlans({ activeOnly: true });
    return c.json({ plans: all });
  })

  // Get single plan by slug
  .get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const plan = await db.query.plans.findFirst({
      where: eq(plans.slug, slug),
    });
    if (!plan) throw new HTTPException(404, { message: "Plan not found" });
    return c.json({ plan });
  });
