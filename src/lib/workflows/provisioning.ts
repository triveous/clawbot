import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistants, assistantCredentials } from "@/lib/db/schema";
import { getProvider, getHetznerProvider } from "@/lib/providers";
import { createDnsRecord as cloudflareCreateDnsRecord } from "@/lib/providers/cloudflare";
import type { FirewallRule } from "@/lib/providers/types";
import { buildCloudInit } from "./cloud-init";
import type { AccessMode } from "./cloud-init";
import { generateEd25519KeyPair } from "./ssh-keys";
import { extractSubdomain } from "./slug";

function log(step: string, msg: string) {
  console.log(`[provisioning:${step}] ${new Date().toISOString()} — ${msg}`);
}

function randomGatewayPort(): number {
  // Range 20000–29999 — avoids well-known ports and the hardcoded legacy 18789.
  return 20000 + Math.floor(Math.random() * 10000);
}

async function prepareCredentials() {
  "use step";

  log("prepareCredentials", "Generating root SSH keypair and gateway token…");

  // Root SSH keypair — registered with Hetzner; injected into /root/.ssh/authorized_keys.
  // Openclaw user has no SSH key — root switches via `su - openclaw`.
  const { opensshPrivate: rootPrivateKey, opensshPublic: rootPublicKey } =
    generateEd25519KeyPair("root@snapclaw");

  const gatewayToken = crypto.randomBytes(32).toString("hex");
  const gatewayPort = randomGatewayPort();

  log("prepareCredentials", `Credentials generated (gatewayPort=${gatewayPort})`);
  return {
    rootPrivateKey,
    rootPublicKey,
    gatewayToken,
    gatewayPort,
  };
}

async function createFirewall(
  assistantId: string,
  accessMode: AccessMode,
  sshAllowedIps: string[],
): Promise<{ firewallId: string }> {
  "use step";

  const hetzner = getHetznerProvider();

  let rules: FirewallRule[];
  if (accessMode === "ssh") {
    rules = [
      {
        direction: "in",
        protocol: "tcp",
        port: "22",
        source_ips: sshAllowedIps,
      },
    ];
  } else {
    // tailscale_serve: allow WireGuard only, block SSH entirely.
    rules = [
      {
        direction: "in",
        protocol: "udp",
        port: "41641",
        source_ips: ["0.0.0.0/0", "::/0"],
      },
    ];
  }

  const name = `openclaw-${assistantId.slice(0, 8)}`;
  log("createFirewall", `Creating firewall "${name}" for accessMode=${accessMode}…`);
  const { firewallId } = await hetzner.createFirewall(name, rules);
  log("createFirewall", `Firewall created: id=${firewallId}`);

  await db
    .update(assistants)
    .set({ firewallId })
    .where(eq(assistants.id, assistantId));

  return { firewallId };
}

async function createServer(
  assistantId: string,
  snapshotId: string,
  region: string,
  rootPublicKey: string,
  gatewayToken: string,
  gatewayPort: number,
  accessMode: AccessMode,
  firewallId: string,
  tailscaleAuthKey: string | undefined,
  assistantSlug: string,
) {
  "use step";

  const hetzner = getHetznerProvider();

  log("createServer", `Registering root SSH key for assistant ${assistantId.slice(0, 8)}…`);
  const { keyId: hetznerKeyId } = await hetzner.createSshKey(
    `openclaw-root-${assistantId.slice(0, 8)}`,
    rootPublicKey,
  );
  log("createServer", `SSH key registered: keyId=${hetznerKeyId}`);

  const cloudInit = buildCloudInit(
    rootPublicKey,
    gatewayToken,
    gatewayPort,
    accessMode,
    tailscaleAuthKey,
    assistantSlug,
  );

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
      firewalls: [firewallId],
    });
    serverId = result.server.id;
    ip = result.server.ip;
    log("createServer", `Server created: id=${serverId} ip=${ip}`);
  } finally {
    try {
      await hetzner.deleteSshKey(hetznerKeyId);
      log("createServer", "Root SSH key resource deleted");
    } catch {
      // Non-fatal
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

async function createDnsRecord(assistantId: string, ip: string) {
  "use step";

  log("createDnsRecord", `Resolving DNS for assistant ${assistantId.slice(0, 8)}…`);

  const assistant = await db.query.assistants.findFirst({
    where: eq(assistants.id, assistantId),
  });
  if (!assistant) {
    throw new Error(`Assistant ${assistantId} not found`);
  }

  if (assistant.dnsRecordId) {
    log("createDnsRecord", `Record already exists (${assistant.dnsRecordId}); skipping`);
    return;
  }

  if (!assistant.hostname || !assistant.dnsBaseDomain) {
    throw new Error(
      `Assistant ${assistantId} is missing hostname/dnsBaseDomain — cannot create DNS record`,
    );
  }

  const subdomain = extractSubdomain(assistant.hostname, assistant.dnsBaseDomain);
  if (!subdomain) {
    throw new Error(
      `Stored hostname ${assistant.hostname} does not end with .${assistant.dnsBaseDomain}`,
    );
  }

  const { recordId, zoneId, fqdn } = await cloudflareCreateDnsRecord({
    name: subdomain,
    ipv4: ip,
  });
  log("createDnsRecord", `Record created: ${fqdn} → ${ip} (id=${recordId})`);

  await db
    .update(assistants)
    .set({ dnsRecordId: recordId, dnsZoneId: zoneId })
    .where(eq(assistants.id, assistantId));
}

async function finalize(
  assistantId: string,
  ip: string,
  rootPrivateKey: string,
  gatewayToken: string,
  gatewayPort: number,
  tailscaleAuthKey: string | undefined,
) {
  "use step";

  log("finalize", `Storing credentials and marking assistant ${assistantId.slice(0, 8)} as running…`);
  await db.insert(assistantCredentials).values({
    assistantId,
    rootCredentialType: "ssh",
    rootCredential: rootPrivateKey,
    gatewayToken,
    gatewayPort,
    tailscaleAuthKey: tailscaleAuthKey ?? null,
  });

  await db
    .update(assistants)
    .set({ status: "running", ipv4: ip, gatewayPort })
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

async function cleanupFirewall(assistantId: string) {
  "use step";

  const assistant = await db.query.assistants.findFirst({
    where: eq(assistants.id, assistantId),
  });
  if (!assistant?.firewallId) return;

  log("cleanupFirewall", `Best-effort delete of firewall ${assistant.firewallId}`);
  const hetzner = getHetznerProvider();
  await hetzner.deleteFirewall(assistant.firewallId).catch((err) => {
    log("cleanupFirewall", `Firewall delete failed: ${String(err)}`);
  });
}

export async function provisionAssistant(
  assistantId: string,
  snapshotId: string,
  region: string,
  hostname: string,
  accessMode: AccessMode = "ssh",
  sshAllowedIps: string = "0.0.0.0/0",
  tailscaleAuthKey?: string,
) {
  "use workflow";

  log(
    "workflow",
    `Starting provisionAssistant assistantId=${assistantId} snapshotId=${snapshotId} region=${region} hostname=${hostname} accessMode=${accessMode}`,
  );

  const resolvedSshAllowedIps =
    sshAllowedIps === "0.0.0.0/0"
      ? ["0.0.0.0/0", "::/0"]
      : sshAllowedIps.split(",").map((s) => s.trim());

  // Extract slug from hostname (everything before the first dot)
  const assistantSlug = hostname.split(".")[0];

  try {
    const credentials = await prepareCredentials();

    const { firewallId } = await createFirewall(
      assistantId,
      accessMode,
      resolvedSshAllowedIps,
    );

    const server = await createServer(
      assistantId,
      snapshotId,
      region,
      credentials.rootPublicKey,
      credentials.gatewayToken,
      credentials.gatewayPort,
      accessMode,
      firewallId,
      tailscaleAuthKey,
      assistantSlug,
    );

    await waitForReady(server.serverId);

    await createDnsRecord(assistantId, server.ip);

    await finalize(
      assistantId,
      server.ip,
      credentials.rootPrivateKey,
      credentials.gatewayToken,
      credentials.gatewayPort,
      tailscaleAuthKey,
    );

    log("workflow", `provisionAssistant complete — serverId=${server.serverId} ip=${server.ip}`);
    return { serverId: server.serverId, ip: server.ip };
  } catch (error) {
    log("workflow", `provisionAssistant FAILED: ${String(error)}`);
    await markError(assistantId);
    await cleanupFirewall(assistantId);
    throw error;
  }
}
