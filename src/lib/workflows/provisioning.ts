import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistants,
  assistantCredentials,
  instances,
  instanceEvents,
} from "@/lib/db/schema";
import { getProvider, getHetznerProvider } from "@/lib/providers";
import { createDnsRecord as cloudflareCreateDnsRecord } from "@/lib/providers/cloudflare";
import type { FirewallRule } from "@/lib/providers/types";
import { buildCloudInit } from "./cloud-init";
import type { AccessMode } from "./cloud-init";
import { generateEd25519KeyPair } from "./ssh-keys";
import { extractSubdomain } from "./slug";
import { getPlan, getHetznerServerType } from "@/lib/plans/catalog";
import { encrypt } from "@/lib/crypto/envelope";

function log(step: string, msg: string) {
  console.log(`[provisioning:${step}] ${new Date().toISOString()} — ${msg}`);
}

function randomGatewayPort(): number {
  return 20000 + Math.floor(Math.random() * 10000);
}

async function recordEvent(
  instanceId: string,
  step: string,
  status: "started" | "ok" | "failed",
  message?: string,
  payload?: Record<string, unknown>,
) {
  try {
    await db.insert(instanceEvents).values({
      instanceId,
      step,
      status,
      message: message ?? null,
      payload: payload ?? null,
    });
  } catch {
    // Non-fatal — never let event recording break provisioning
  }
}

async function prepareCredentials(instanceId: string) {
  "use step";

  log("prepareCredentials", "Generating root SSH keypair and gateway token…");
  await recordEvent(instanceId, "prepareCredentials", "started");

  const { opensshPrivate: rootPrivateKey, opensshPublic: rootPublicKey } =
    generateEd25519KeyPair("root@snapclaw");

  const gatewayToken = crypto.randomBytes(32).toString("hex");
  const gatewayPort = randomGatewayPort();

  log("prepareCredentials", `Credentials generated (gatewayPort=${gatewayPort})`);
  await recordEvent(instanceId, "prepareCredentials", "ok", undefined, {
    gatewayPort,
  });
  return { rootPrivateKey, rootPublicKey, gatewayToken, gatewayPort };
}

async function createFirewall(
  instanceId: string,
  accessMode: AccessMode,
  sshAllowedIps: string[],
): Promise<{ firewallId: string }> {
  "use step";

  await recordEvent(instanceId, "createFirewall", "started");
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
    rules = [
      {
        direction: "in",
        protocol: "udp",
        port: "41641",
        source_ips: ["0.0.0.0/0", "::/0"],
      },
    ];
  }

  const name = `openclaw-${instanceId.slice(0, 8)}`;
  log("createFirewall", `Creating firewall "${name}" for accessMode=${accessMode}…`);
  const { firewallId } = await hetzner.createFirewall(name, rules);
  log("createFirewall", `Firewall created: id=${firewallId}`);

  await db
    .update(instances)
    .set({ firewallId })
    .where(eq(instances.id, instanceId));

  await recordEvent(instanceId, "createFirewall", "ok", undefined, {
    firewallId,
  });
  return { firewallId };
}

async function createServer(
  assistantId: string,
  instanceId: string,
  snapshotId: string,
  planId: string,
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

  await recordEvent(instanceId, "createServer", "started");
  const hetzner = getHetznerProvider();

  // Resolve server type from plan's provider spec
  const plan = await getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  const serverType = getHetznerServerType(plan);

  log("createServer", `Registering root SSH key for instance ${instanceId.slice(0, 8)}…`);
  const { keyId: hetznerKeyId } = await hetzner.createSshKey(
    `openclaw-root-${instanceId.slice(0, 8)}`,
    rootPublicKey,
  );

  const cloudInit = buildCloudInit(
    rootPublicKey,
    gatewayToken,
    gatewayPort,
    accessMode,
    tailscaleAuthKey,
    assistantSlug,
  );

  log("createServer", `Creating server (${serverType}) from snapshot ${snapshotId} in ${region}…`);
  let serverId: string;
  let ip: string;
  try {
    const result = await hetzner.createServer({
      name: `openclaw-${instanceId.slice(0, 8)}`,
      image: snapshotId,
      region,
      serverType,
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
    } catch {
      // Non-fatal
    }
  }

  await db
    .update(instances)
    .set({
      status: "provisioning",
      providerServerId: serverId,
      providerSnapshotId: snapshotId,
      ipv4: ip,
      gatewayPort,
    })
    .where(eq(instances.id, instanceId));

  await recordEvent(instanceId, "createServer", "ok", undefined, {
    serverId,
    ip,
  });
  log("createServer", "Instance status updated to provisioning");
  return { serverId, ip };
}

async function waitForReady(instanceId: string, serverId: string) {
  "use step";

  await recordEvent(instanceId, "waitForReady", "started");
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
      await recordEvent(instanceId, "waitForReady", "ok");
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const msg = `Server ${serverId} did not become ready after ${maxAttempts} attempts`;
  await recordEvent(instanceId, "waitForReady", "failed", msg);
  throw new Error(msg);
}

async function createDnsRecord(assistantId: string, instanceId: string, ip: string) {
  "use step";

  await recordEvent(instanceId, "createDnsRecord", "started");
  log("createDnsRecord", `Resolving DNS for assistant ${assistantId.slice(0, 8)}…`);

  const assistant = await db.query.assistants.findFirst({
    where: eq(assistants.id, assistantId),
  });
  if (!assistant) throw new Error(`Assistant ${assistantId} not found`);

  if (assistant.dnsRecordId) {
    log("createDnsRecord", `Record already exists (${assistant.dnsRecordId}); skipping`);
    await recordEvent(instanceId, "createDnsRecord", "ok", "already exists");
    return;
  }

  if (!assistant.hostname || !assistant.dnsBaseDomain) {
    throw new Error(
      `Assistant ${assistantId} is missing hostname/dnsBaseDomain`,
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

  await recordEvent(instanceId, "createDnsRecord", "ok", undefined, {
    fqdn,
    recordId,
  });
}

async function finalize(
  assistantId: string,
  instanceId: string,
  ip: string,
  rootPrivateKey: string,
  gatewayToken: string,
  gatewayPort: number,
) {
  "use step";

  await recordEvent(instanceId, "finalize", "started");
  log("finalize", `Storing credentials and marking assistant ${assistantId.slice(0, 8)} as active…`);

  await db.insert(assistantCredentials).values({
    assistantId,
    rootCredentialType: "ssh",
    rootCredential: encrypt(rootPrivateKey),
    gatewayToken: encrypt(gatewayToken),
    gatewayPort,
  });

  await db
    .update(instances)
    .set({ status: "running", ipv4: ip, gatewayPort })
    .where(eq(instances.id, instanceId));

  await db
    .update(assistants)
    .set({ status: "active", instanceId })
    .where(eq(assistants.id, assistantId));

  await recordEvent(instanceId, "finalize", "ok");
  log("finalize", `Assistant is active at ${ip}`);
}

async function markError(assistantId: string, instanceId: string, error: unknown) {
  "use step";

  const msg = String(error);
  log("markError", `Marking assistant ${assistantId.slice(0, 8)} as error: ${msg}`);

  await db
    .update(instances)
    .set({ status: "error", lastError: msg })
    .where(eq(instances.id, instanceId));

  await db
    .update(assistants)
    .set({ status: "error", lastErrorAt: new Date() })
    .where(eq(assistants.id, assistantId));
}

async function cleanupFirewall(instanceId: string) {
  "use step";

  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance?.firewallId) return;

  log("cleanupFirewall", `Best-effort delete of firewall ${instance.firewallId}`);
  const hetzner = getHetznerProvider();
  await hetzner.deleteFirewall(instance.firewallId).catch((err) => {
    log("cleanupFirewall", `Firewall delete failed: ${String(err)}`);
  });
}

export async function provisionAssistant(
  assistantId: string,
  instanceId: string,
  snapshotId: string,
  planId: string,
  region: string,
  hostname: string,
  accessMode: AccessMode = "ssh",
  sshAllowedIps: string = "0.0.0.0/0",
  tailscaleAuthKey?: string,
) {
  "use workflow";

  log(
    "workflow",
    `Starting provisionAssistant assistantId=${assistantId} instanceId=${instanceId} planId=${planId} region=${region} accessMode=${accessMode}`,
  );

  const resolvedSshAllowedIps =
    sshAllowedIps === "0.0.0.0/0"
      ? ["0.0.0.0/0", "::/0"]
      : sshAllowedIps.split(",").map((s) => s.trim());

  const assistantSlug = hostname.split(".")[0];

  try {
    const credentials = await prepareCredentials(instanceId);

    const { firewallId } = await createFirewall(
      instanceId,
      accessMode,
      resolvedSshAllowedIps,
    );

    const server = await createServer(
      assistantId,
      instanceId,
      snapshotId,
      planId,
      region,
      credentials.rootPublicKey,
      credentials.gatewayToken,
      credentials.gatewayPort,
      accessMode,
      firewallId,
      tailscaleAuthKey,
      assistantSlug,
    );

    await waitForReady(instanceId, server.serverId);
    await createDnsRecord(assistantId, instanceId, server.ip);
    await finalize(
      assistantId,
      instanceId,
      server.ip,
      credentials.rootPrivateKey,
      credentials.gatewayToken,
      credentials.gatewayPort,
    );

    log("workflow", `provisionAssistant complete — serverId=${server.serverId} ip=${server.ip}`);
    return { serverId: server.serverId, ip: server.ip };
  } catch (error) {
    log("workflow", `provisionAssistant FAILED: ${String(error)}`);
    await markError(assistantId, instanceId, error);
    await cleanupFirewall(instanceId);
    throw error;
  }
}
