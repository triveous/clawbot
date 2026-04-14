import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { getHetznerProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/types";

function log(step: string, msg: string) {
  console.log(`[deleteSnapshot:${step}] ${new Date().toISOString()} — ${msg}`);
}

async function fetchSnapshot(snapshotId: string) {
  "use step";

  const snapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.id, snapshotId),
  });

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found in DB`);
  }

  log(
    "fetch",
    `Found: providerSnapshotId=${snapshot.providerSnapshotId} provider=${snapshot.provider} isActive=${snapshot.isActive}`,
  );

  return {
    providerSnapshotId: snapshot.providerSnapshotId,
    provider: snapshot.provider,
  };
}

async function deleteHetznerImage(providerSnapshotId: string) {
  "use step";

  log("deleteImage", `Deleting Hetzner image ${providerSnapshotId}…`);
  const hetzner = getHetznerProvider();

  try {
    await hetzner.deleteImage(providerSnapshotId);
    log("deleteImage", `Image ${providerSnapshotId} deleted from Hetzner`);
  } catch (err) {
    // 404 = already gone — safe to continue and clean up the DB record
    if (err instanceof ProviderError && err.statusCode === 404) {
      log(
        "deleteImage",
        `Image ${providerSnapshotId} not found on Hetzner (already deleted), continuing`,
      );
    } else {
      throw err;
    }
  }
}

async function deleteFromDb(snapshotId: string) {
  "use step";

  log("deleteDb", `Deleting snapshot ${snapshotId} from DB…`);
  await db.delete(snapshots).where(eq(snapshots.id, snapshotId));
  log("deleteDb", "Snapshot record deleted");
}

export async function deleteSnapshot(snapshotId: string) {
  "use workflow";

  log("workflow", `Starting deleteSnapshot snapshotId=${snapshotId}`);

  const { providerSnapshotId, provider } = await fetchSnapshot(snapshotId);

  if (provider === "hetzner") {
    await deleteHetznerImage(providerSnapshotId);
  }

  await deleteFromDb(snapshotId);

  log("workflow", `deleteSnapshot complete — snapshotId=${snapshotId}`);
  return { deleted: true, snapshotId };
}
