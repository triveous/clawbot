import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import type { Provider } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/workflows/bootstrap";
import { deleteSnapshot } from "@/lib/workflows/snapshot-deletion";

const VALID_PROVIDERS: Provider[] = ["hetzner"];

export const adminRoute = new Hono()

  // Trigger snapshot build workflow for a specific provider
  // POST /admin/providers/:provider/snapshots/build
  .post("/providers/:provider/snapshots/build", async (c) => {
    const provider = c.req.param("provider") as Provider;

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const body = await c.req.json<{
      version?: string;
      openclawVersion?: string;
    }>();

    if (!body.version || !body.openclawVersion) {
      throw new HTTPException(400, {
        message: "version and openclawVersion are required",
      });
    }

    const run = await start(buildSnapshot, [
      body.version,
      body.openclawVersion,
    ]);

    return c.json({ runId: run.runId, message: "Snapshot build started" }, 202);
  })

  // List snapshots for a specific provider
  // GET /admin/providers/:provider/snapshots
  .get("/providers/:provider/snapshots", async (c) => {
    const provider = c.req.param("provider") as Provider;

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const providerSnapshots = await db.query.snapshots.findMany({
      where: eq(snapshots.provider, provider),
      orderBy: desc(snapshots.createdAt),
    });

    return c.json({ snapshots: providerSnapshots });
  })

  // Delete a snapshot — removes from Hetzner and DB via durable workflow
  // DELETE /admin/providers/:provider/snapshots/:id
  .delete("/providers/:provider/snapshots/:id", async (c) => {
    const provider = c.req.param("provider") as Provider;
    const snapshotId = c.req.param("id");

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HTTPException(400, {
        message: `Unknown provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const snapshot = await db.query.snapshots.findFirst({
      where: and(eq(snapshots.id, snapshotId), eq(snapshots.provider, provider)),
    });

    if (!snapshot) {
      throw new HTTPException(404, { message: "Snapshot not found" });
    }

    const run = await start(deleteSnapshot, [snapshotId]);
    return c.json({ runId: run.runId, message: "Snapshot deletion started" }, 202);
  });
