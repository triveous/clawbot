import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, desc, isNull } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import {
  assistants,
  instances,
  snapshots,
  instanceEvents,
  assistantCredentials,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/envelope";
import type { Assistant, Instance } from "@/lib/db/schema";
import { canProvision, consumeCredit, releaseCredit } from "@/lib/billing/credits";
import { getProvider, getHetznerProvider } from "@/lib/providers";
import {
  createDnsRecord,
  deleteDnsRecord,
} from "@/lib/providers/cloudflare";
import { provisionAssistant } from "@/lib/workflows/provisioning";
import { generateHostnameSlug, buildFqdn } from "@/lib/workflows/slug";
import type { AssistantResponse } from "@/types/assistant";

const VALID_REGIONS = ["fsn1", "nbg1", "hel1"] as const;
const MAX_NAME_LENGTH = 64;

function toAssistantResponse(
  assistant: Assistant,
  instance: Instance | null,
): AssistantResponse {
  return {
    id: assistant.id,
    name: assistant.name,
    status: assistant.status,
    provider: assistant.provider,
    planId: assistant.planId,
    ipv4: instance?.ipv4 ?? null,
    hostname: assistant.hostname,
    region: assistant.region,
    accessMode: assistant.accessMode,
    gatewayPort: instance?.gatewayPort ?? null,
    instanceId: assistant.instanceId,
    lastErrorAt: assistant.lastErrorAt?.toISOString() ?? null,
    sshAllowedIps: assistant.sshAllowedIps,
    createdAt: assistant.createdAt.toISOString(),
  };
}

async function getOwnedAssistant(
  orgId: string,
  assistantId: string,
): Promise<{ assistant: Assistant; instance: Instance | null } | null> {
  const assistant = await db.query.assistants.findFirst({
    where: and(
      eq(assistants.id, assistantId),
      eq(assistants.orgId, orgId),
      isNull(assistants.deletedAt),
    ),
  });
  if (!assistant) return null;

  const instance = assistant.instanceId
    ? (await db.query.instances.findFirst({
        where: eq(instances.id, assistant.instanceId),
      })) ?? null
    : null;

  return { assistant, instance };
}

export const assistantsRoute = new Hono()

  // List assistants
  .get("/", async (c) => {
    const dbOrg = c.get("dbOrg");

    const rows = await db.query.assistants.findMany({
      where: and(
        eq(assistants.orgId, dbOrg.id),
        isNull(assistants.deletedAt),
      ),
      orderBy: desc(assistants.createdAt),
    });

    const withInstances = await Promise.all(
      rows.map(async (a) => {
        const instance = a.instanceId
          ? (await db.query.instances.findFirst({
              where: eq(instances.id, a.instanceId),
            })) ?? null
          : null;
        return toAssistantResponse(a, instance);
      }),
    );

    return c.json({ assistants: withInstances });
  })

  // Create assistant
  .post("/", async (c) => {
    const dbUser = c.get("dbUser");
    const dbOrg = c.get("dbOrg");
    const body = await c.req.json<{
      name?: string;
      planId?: string;
      region?: string;
      accessMode?: string;
      sshAllowedIps?: string;
      tailscaleAuthKey?: string;
    }>();

    if (!body.name?.trim()) {
      throw new HTTPException(400, { message: "Assistant name is required" });
    }
    if (body.name.length > MAX_NAME_LENGTH) {
      throw new HTTPException(400, {
        message: `Assistant name must be ${MAX_NAME_LENGTH} characters or less`,
      });
    }
    if (!body.planId) {
      throw new HTTPException(400, { message: "planId is required" });
    }

    const region = body.region ?? "fsn1";
    if (!VALID_REGIONS.includes(region as (typeof VALID_REGIONS)[number])) {
      throw new HTTPException(400, {
        message: `Invalid region. Must be one of: ${VALID_REGIONS.join(", ")}`,
      });
    }

    const VALID_ACCESS_MODES = ["ssh", "tailscale_serve"] as const;
    type ValidAccessMode = (typeof VALID_ACCESS_MODES)[number];
    const accessMode: ValidAccessMode =
      (body.accessMode as ValidAccessMode) ?? "ssh";
    if (!VALID_ACCESS_MODES.includes(accessMode)) {
      throw new HTTPException(400, {
        message: `Invalid accessMode. Must be one of: ${VALID_ACCESS_MODES.join(", ")}`,
      });
    }

    if (accessMode === "tailscale_serve" && !body.tailscaleAuthKey) {
      throw new HTTPException(422, {
        message: "tailscaleAuthKey is required for tailscale_serve access mode",
      });
    }

    const allowed = await canProvision(dbOrg.id, body.planId);
    if (!allowed) {
      throw new HTTPException(402, {
        message:
          "No available credit for this plan tier. Purchase a subscription or upgrade your plan.",
      });
    }

    const activeSnapshot = await db.query.snapshots.findFirst({
      where: and(
        eq(snapshots.isActive, true),
        eq(snapshots.provider, "hetzner"),
      ),
    });
    if (!activeSnapshot) {
      throw new HTTPException(503, {
        message: "No active snapshot available for provisioning",
      });
    }

    const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
    if (!baseDomain) {
      throw new HTTPException(503, {
        message: "CLOUDFLARE_BASE_DOMAIN is not configured",
      });
    }

    // Atomic: create assistant + instance, consume credit
    const { assistant, instance } = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(assistants)
        .values({
          orgId: dbOrg.id,
          createdByUserId: dbUser.id,
          planId: body.planId!,
          name: body.name!.trim(),
          status: "creating",
          provider: "hetzner",
          region,
          accessMode,
          sshAllowedIps: body.sshAllowedIps ?? null,
        })
        .returning();

      const slug = generateHostnameSlug(inserted.name, inserted.id);
      const hostname = buildFqdn(slug, baseDomain);

      const [assistantWithHostname] = await tx
        .update(assistants)
        .set({ hostname, dnsBaseDomain: baseDomain })
        .where(eq(assistants.id, inserted.id))
        .returning();

      const [inst] = await tx
        .insert(instances)
        .values({
          assistantId: assistantWithHostname.id,
          provider: "hetzner",
          providerSnapshotId: activeSnapshot.providerSnapshotId,
          region,
          status: "creating",
        })
        .returning();

      await consumeCredit(dbOrg.id, body.planId!, assistantWithHostname.id, tx as Parameters<typeof consumeCredit>[3]);

      return { assistant: assistantWithHostname, instance: inst };
    });

    await start(provisionAssistant, [
      assistant.id,
      instance.id,
      activeSnapshot.providerSnapshotId,
      body.planId,
      region,
      assistant.hostname!,
      accessMode,
      body.sshAllowedIps ?? "0.0.0.0/0",
      body.tailscaleAuthKey,
    ]);

    return c.json(toAssistantResponse(assistant, instance), 201);
  })

  // Get single assistant
  .get("/:id", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });

    return c.json(toAssistantResponse(result.assistant, result.instance));
  })

  // Restart assistant
  .post("/:id/restart", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (assistant.status !== "active" && assistant.status !== "stopped") {
      throw new HTTPException(409, {
        message: `Cannot restart assistant in "${assistant.status}" state`,
      });
    }
    if (!instance?.providerServerId) {
      throw new HTTPException(409, { message: "Assistant has no server" });
    }

    const provider = getProvider(assistant.provider);
    await provider.reboot(instance.providerServerId);

    const [updated] = await db
      .update(assistants)
      .set({ status: "active" })
      .where(eq(assistants.id, assistantId))
      .returning();

    return c.json(toAssistantResponse(updated, instance));
  })

  // Stop assistant
  .post("/:id/stop", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (assistant.status !== "active") {
      throw new HTTPException(409, {
        message: `Cannot stop assistant in "${assistant.status}" state`,
      });
    }
    if (!instance?.providerServerId) {
      throw new HTTPException(409, { message: "Assistant has no server" });
    }

    const provider = getProvider(assistant.provider);
    await provider.powerOff(instance.providerServerId);

    const [updated] = await db
      .update(assistants)
      .set({ status: "stopped" })
      .where(eq(assistants.id, assistantId))
      .returning();

    return c.json(toAssistantResponse(updated, instance));
  })

  // Delete assistant (soft delete + credit release + VPS teardown)
  .delete("/:id", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (assistant.dnsRecordId && assistant.dnsZoneId) {
      try {
        await deleteDnsRecord({
          recordId: assistant.dnsRecordId,
          zoneId: assistant.dnsZoneId,
        });
      } catch {
        // Orphan DNS record — acceptable
      }
    }

    if (instance) {
      if (instance.firewallId && instance.providerServerId) {
        try {
          const hetzner = getHetznerProvider();
          await hetzner.detachFirewall(instance.firewallId, instance.providerServerId);
        } catch {
          // Best-effort
        }
      }

      if (instance.providerServerId) {
        try {
          const provider = getProvider(assistant.provider);
          await provider.deleteServer(instance.providerServerId);
        } catch {
          // Server may already be deleted
        }
      }

      if (instance.firewallId) {
        try {
          const hetzner = getHetznerProvider();
          await hetzner.deleteFirewall(instance.firewallId);
        } catch {
          // Best-effort
        }
      }
    }

    await db.transaction(async (tx) => {
      if (instance) {
        await tx
          .update(instances)
          .set({ status: "destroyed", destroyedAt: new Date() })
          .where(eq(instances.id, instance.id));
      }

      await tx
        .update(assistants)
        .set({
          deletedAt: new Date(),
          instanceId: null,
          status: "stopped",
        })
        .where(eq(assistants.id, assistantId));

      await releaseCredit(assistantId, tx as Parameters<typeof releaseCredit>[1]);
    });

    return c.json({ deleted: true });
  })

  // Retry provisioning on a failed assistant
  .post("/:id/retry", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (assistant.status !== "error") {
      throw new HTTPException(409, {
        message: `Assistant is not in error state (current: "${assistant.status}")`,
      });
    }

    const activeSnapshot = await db.query.snapshots.findFirst({
      where: and(
        eq(snapshots.isActive, true),
        eq(snapshots.provider, "hetzner"),
      ),
    });
    if (!activeSnapshot) {
      throw new HTTPException(503, { message: "No active snapshot available" });
    }

    let instanceId: string;

    if (instance && !instance.providerServerId) {
      // No VPS was created — reuse the existing instance row
      instanceId = instance.id;
      await db
        .update(instances)
        .set({ status: "creating", lastError: null })
        .where(eq(instances.id, instance.id));
    } else {
      // Partial VPS may exist — mark old instance destroyed and create fresh one
      if (instance) {
        await db
          .update(instances)
          .set({ status: "destroyed", destroyedAt: new Date() })
          .where(eq(instances.id, instance.id));
      }

      const [newInstance] = await db
        .insert(instances)
        .values({
          assistantId,
          provider: assistant.provider,
          providerSnapshotId: activeSnapshot.providerSnapshotId,
          region: assistant.region,
          status: "creating",
        })
        .returning();

      instanceId = newInstance.id;
    }

    await db
      .update(assistants)
      .set({ status: "creating", lastErrorAt: null })
      .where(eq(assistants.id, assistantId));

    await start(provisionAssistant, [
      assistantId,
      instanceId,
      activeSnapshot.providerSnapshotId,
      assistant.planId,
      assistant.region,
      assistant.hostname!,
      assistant.accessMode,
      assistant.sshAllowedIps ?? "0.0.0.0/0",
    ]);

    return c.json({ retrying: true });
  })

  // Get last error details (instance events)
  .get("/:id/last-error", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { instance } = result;

    if (!instance) return c.json({ events: [] });

    const events = await db.query.instanceEvents.findMany({
      where: eq(instanceEvents.instanceId, instance.id),
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
      limit: 50,
    });

    return c.json({ events });
  })

  // Regenerate hostname / DNS record
  .post("/:id/regenerate-hostname", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (!instance?.ipv4) {
      throw new HTTPException(409, {
        message: "Assistant has no IPv4 yet — cannot create DNS record",
      });
    }

    const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
    if (!baseDomain) {
      throw new HTTPException(503, {
        message: "CLOUDFLARE_BASE_DOMAIN is not configured",
      });
    }

    if (assistant.dnsRecordId && assistant.dnsZoneId) {
      try {
        await deleteDnsRecord({
          recordId: assistant.dnsRecordId,
          zoneId: assistant.dnsZoneId,
        });
      } catch {
        // best-effort
      }
    }

    const slug = generateHostnameSlug(assistant.name, assistant.id);
    const { recordId, zoneId, fqdn } = await createDnsRecord({
      name: slug,
      ipv4: instance.ipv4,
    });

    const [updated] = await db
      .update(assistants)
      .set({
        hostname: fqdn,
        dnsRecordId: recordId,
        dnsZoneId: zoneId,
        dnsBaseDomain: baseDomain,
      })
      .where(eq(assistants.id, assistantId))
      .returning();

    return c.json(toAssistantResponse(updated, instance));
  })

  // Update SSH allowed IPs and sync to Hetzner firewall
  .patch("/:id/firewall", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");
    const body = await c.req.json<{ sshAllowedIps?: string }>();

    if (!body.sshAllowedIps?.trim()) {
      throw new HTTPException(400, { message: "sshAllowedIps is required" });
    }

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { assistant, instance } = result;

    if (assistant.accessMode !== "ssh") {
      throw new HTTPException(409, {
        message: "Firewall rules only apply to ssh access mode",
      });
    }

    if (instance?.firewallId) {
      const cidrs = body.sshAllowedIps
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const hetzner = getHetznerProvider();
      await hetzner.updateFirewall(instance.firewallId, [
        { direction: "in", protocol: "tcp", port: "22", source_ips: cidrs },
      ]);
    }

    const [updated] = await db
      .update(assistants)
      .set({ sshAllowedIps: body.sshAllowedIps.trim() })
      .where(eq(assistants.id, assistantId))
      .returning();

    return c.json(toAssistantResponse(updated, instance));
  })

  // Get Hetzner server metrics
  .get("/:id/metrics", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");
    const type = (c.req.query("type") ?? "cpu") as "cpu" | "disk" | "network";
    const window = c.req.query("window") ?? "1h";

    const VALID_TYPES = ["cpu", "disk", "network"] as const;
    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      throw new HTTPException(400, {
        message: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });
    const { instance } = result;

    if (!instance?.providerServerId) {
      return c.json({ series: {} });
    }

    const windowMs: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
    };
    const durationMs = windowMs[window] ?? windowMs["1h"];
    const end = new Date();
    const start = new Date(end.getTime() - durationMs);

    const hetzner = getHetznerProvider();
    const metrics = await hetzner.getMetrics(instance.providerServerId, type, start, end);
    return c.json(metrics);
  })

  .get("/:id/gateway-token", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });

    const cred = await db.query.assistantCredentials.findFirst({
      where: eq(assistantCredentials.assistantId, assistantId),
    });

    if (!cred?.gatewayToken) {
      throw new HTTPException(404, { message: "Gateway token not available yet" });
    }

    return c.json({ token: decrypt(cred.gatewayToken) });
  })

  .get("/:id/ssh-key", async (c) => {
    const dbOrg = c.get("dbOrg");
    const assistantId = c.req.param("id");

    const result = await getOwnedAssistant(dbOrg.id, assistantId);
    if (!result) throw new HTTPException(404, { message: "Assistant not found" });

    if (result.assistant.accessMode !== "ssh") {
      throw new HTTPException(400, { message: "This assistant uses Tailscale, not SSH" });
    }

    const cred = await db.query.assistantCredentials.findFirst({
      where: eq(assistantCredentials.assistantId, assistantId),
    });

    if (!cred?.rootCredential) {
      throw new HTTPException(404, { message: "SSH key not available yet" });
    }

    const privateKey = decrypt(cred.rootCredential);
    const filename = `${result.assistant.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pem`;

    return new Response(privateKey, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
