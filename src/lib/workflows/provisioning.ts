import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistants, assistantCredentials } from "@/lib/db/schema";
import { getProvider, getHetznerProvider } from "@/lib/providers";
import { buildCloudInit } from "./cloud-init";
import { generateEd25519KeyPair } from "./ssh-keys";

function log(step: string, msg: string) {
  console.log(`[provisioning:${step}] ${new Date().toISOString()} — ${msg}`);
}

async function prepareCredentials() {
  "use step";

  log("prepareCredentials", "Generating SSH keypairs and gateway token…");

  // Root SSH keypair — for emergency root access to the agent server.
  const { opensshPrivate: rootPrivateKey, opensshPublic: rootPublicKey } =
    generateEd25519KeyPair("root@snapclaw");

  // Openclaw user keypair — injected via cloud-init for Gateway SSH tunnel.
  const { opensshPrivate: sshPrivateKey, opensshPublic: sshPublicKey } =
    generateEd25519KeyPair("openclaw@snapclaw");

  const gatewayToken = crypto.randomBytes(32).toString("hex");

  log("prepareCredentials", "Credentials generated");
  return {
    rootPrivateKey,
    rootPublicKey,
    sshPrivateKey,
    sshPublicKey,
    gatewayToken,
  };
}

async function createServer(
  assistantId: string,
  snapshotId: string,
  region: string,
  rootPublicKey: string,
  sshPublicKey: string,
  gatewayToken: string,
) {
  "use step";

  const hetzner = getHetznerProvider();

  log("createServer", `Registering root SSH key for assistant ${assistantId.slice(0, 8)}…`);
  // Register the root SSH key with Hetzner so it can inject it into authorized_keys.
  const { keyId: hetznerKeyId } = await hetzner.createSshKey(
    `openclaw-root-${assistantId.slice(0, 8)}`,
    rootPublicKey,
  );
  log("createServer", `SSH key registered: keyId=${hetznerKeyId}`);

  const cloudInit = buildCloudInit(sshPublicKey, gatewayToken);

  log("createServer", `Creating server from snapshot ${snapshotId} in ${region}…`);
  let serverId: string;
  let ip: string;
  try {
    const result = await hetzner.createServer({
      name: `openclaw-${assistantId.slice(0, 8)}`,
      image: snapshotId,
      region,
      serverType: "cx33",
      userData: cloudInit,
      sshKeys: [hetznerKeyId],
    });
    serverId = result.server.id;
    ip = result.server.ip;
    log("createServer", `Server created: id=${serverId} ip=${ip}`);
  } finally {
    // Key is already injected — delete the Hetzner key resource immediately.
    try {
      await hetzner.deleteSshKey(hetznerKeyId);
      log("createServer", "Root SSH key resource deleted");
    } catch {
      // Non-fatal: key can be cleaned up manually if this fails
    }
  }

  await db
    .update(assistants)
    .set({
      status: "provisioning",
      providerServerId: serverId,
      providerSnapshotId: snapshotId,
    })
    .where(eq(assistants.id, assistantId));

  log("createServer", "Assistant status updated to provisioning");
  return { serverId, ip };
}

async function waitForReady(serverId: string) {
  "use step";

  const provider = getProvider("hetzner");
  const maxAttempts = 60;
  const intervalMs = 5_000;

  log("waitForReady", `Polling server ${serverId} until running…`);
  for (let i = 0; i < maxAttempts; i++) {
    const server = await provider.getServer(serverId);
    log("waitForReady", `Attempt ${i + 1}/${maxAttempts}: status=${server.status}`);
    if (server.status === "running") {
      // Wait additional time for cloud-init to complete
      log("waitForReady", "Server running — waiting 45s for cloud-init…");
      await new Promise((r) => setTimeout(r, 45_000));
      log("waitForReady", "Cloud-init wait complete");
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Server ${serverId} did not become ready after ${maxAttempts} attempts`,
  );
}

async function finalize(
  assistantId: string,
  ip: string,
  rootPrivateKey: string,
  sshPrivateKey: string,
  sshPublicKey: string,
  gatewayToken: string,
) {
  "use step";

  log("finalize", `Storing credentials and marking assistant ${assistantId.slice(0, 8)} as running…`);
  await db.insert(assistantCredentials).values({
    assistantId,
    rootCredentialType: "ssh",
    rootCredential: rootPrivateKey,
    sshPrivateKey,
    sshPublicKey,
    gatewayToken,
    gatewayPort: 18789,
  });

  await db
    .update(assistants)
    .set({ status: "running", ipv4: ip })
    .where(eq(assistants.id, assistantId));

  log("finalize", `Assistant is running at ${ip}`);
}

async function markError(assistantId: string) {
  "use step";

  log("markError", `Marking assistant ${assistantId.slice(0, 8)} as error`);
  await db
    .update(assistants)
    .set({ status: "error" })
    .where(eq(assistants.id, assistantId));
}

export async function provisionAssistant(
  assistantId: string,
  snapshotId: string,
  region: string,
) {
  "use workflow";

  log("workflow", `Starting provisionAssistant assistantId=${assistantId} snapshotId=${snapshotId} region=${region}`);

  try {
    const credentials = await prepareCredentials();

    const server = await createServer(
      assistantId,
      snapshotId,
      region,
      credentials.rootPublicKey,
      credentials.sshPublicKey,
      credentials.gatewayToken,
    );

    await waitForReady(server.serverId);

    await finalize(
      assistantId,
      server.ip,
      credentials.rootPrivateKey,
      credentials.sshPrivateKey,
      credentials.sshPublicKey,
      credentials.gatewayToken,
    );

    log("workflow", `provisionAssistant complete — serverId=${server.serverId} ip=${server.ip}`);
    return { serverId: server.serverId, ip: server.ip };
  } catch (error) {
    log("workflow", `provisionAssistant FAILED: ${String(error)}`);
    await markError(assistantId);
    throw error;
  }
}
