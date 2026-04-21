import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantCredits, plans } from "@/lib/db/schema";

export const creditsRoute = new Hono()

  // List credits for the active org
  .get("/", async (c) => {
    const dbOrg = c.get("dbOrg");
    const credits = await db
      .select()
      .from(assistantCredits)
      .leftJoin(plans, eq(assistantCredits.planId, plans.id))
      .where(eq(assistantCredits.orgId, dbOrg.id));

    return c.json({
      credits: credits.map((r) => ({ ...r.assistant_credits, plan: r.plans })),
    });
  })

  // Get single credit (must belong to active org)
  .get("/:id", async (c) => {
    const dbOrg = c.get("dbOrg");
    const creditId = c.req.param("id");

    const [row] = await db
      .select()
      .from(assistantCredits)
      .leftJoin(plans, eq(assistantCredits.planId, plans.id))
      .where(
        and(
          eq(assistantCredits.id, creditId),
          eq(assistantCredits.orgId, dbOrg.id),
        ),
      );

    if (!row) throw new HTTPException(404, { message: "Credit not found" });
    return c.json({ credit: { ...row.assistant_credits, plan: row.plans } });
  });
