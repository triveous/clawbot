"use server";

import { desc } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/workflows/bootstrap";
import { deleteSnapshot } from "@/lib/workflows/snapshot-deletion";

export async function getSnapshots() {
  return db.query.snapshots.findMany({
    orderBy: desc(snapshots.createdAt),
  });
}

export async function triggerSnapshotBuild(
  version: string,
  openclawVersion: string,
) {
  const run = await start(buildSnapshot, [version, openclawVersion]);
  return { runId: run.runId };
}

export async function triggerSnapshotDelete(snapshotId: string) {
  const run = await start(deleteSnapshot, [snapshotId]);
  return { runId: run.runId };
}
